/**
 * Reading a bound project file without reading the project file.
 *
 * Every entry point here works in ranges, because the whole point of the format
 * is that opening a project with gigabytes of board images should touch the
 * header, the index chain, and the document updates — kilobytes — and no
 * asset at all until something asks for one.
 *
 * The range source is abstracted so the same code serves both callers: the
 * writer reads by seeking into a file on disk, while the import flow is handed
 * an `ArrayBuffer` and reads out of memory.
 */

import * as fflate from "fflate";

import {
    BLOCK_HEADER_BYTES,
    BlockType,
    DATA_START,
    type IndexPage,
    type ResolvedIndex,
    type BlockHeader,
    type CommitRecord,
    type FileIdentity,
    decodeBlockHeader,
    crc32,
    liveBytesOf,
    readHeader,
    resolveIndex,
} from "./format";

/** Read `len` bytes at `offset`. Short reads mean end of file, not failure. */
export type ReadRange = (offset: number, len: number) => Promise<Uint8Array>;

export const rangeReaderFor = (bytes: Uint8Array): ReadRange => async (offset, len) =>
    bytes.subarray(offset, offset + len);

export interface ProjectFile {
    identity: FileIdentity;
    commit: CommitRecord;
    /** The slot the next save must write — the one not currently in force. */
    writeSlot: 0 | 1;
    index: ResolvedIndex;
    /** Bytes the file holds that nothing reachable accounts for. */
    freeBytes: number;
    /** Free space as a share of the file, which is what the UI offers to reclaim. */
    freeFraction: number;
}

/** True when these bytes carry our identity record. */
export function isProjectFile(head: Uint8Array): boolean {
    return readHeader(head.subarray(0, DATA_START)) !== null;
}

/**
 * Check a block's stored bytes against its header and hand back the payload.
 *
 * Shared by the two readers below so a future block flag cannot be honoured on
 * one path and ignored on the other — the chain walk needs its own byte source
 * (its tail cache), but the verification must not fork with it.
 */
function payloadOf(header: BlockHeader, stored: Uint8Array, offset: number): Uint8Array {
    if (stored.length !== header.length) throw new Error(`truncated block at ${offset}`);
    if (crc32(stored) !== header.crc) throw new Error(`corrupt block at ${offset}`);

    return header.deflated ? fflate.inflateSync(stored) : stored;
}

async function readBlock(read: ReadRange, offset: number): Promise<Uint8Array> {
    const header = decodeBlockHeader(await read(offset, BLOCK_HEADER_BYTES));
    if (!header) throw new Error(`no block at ${offset}`);

    return payloadOf(header, await read(offset + BLOCK_HEADER_BYTES, header.length), offset);
}

/**
 * Walk the index chain and resolve it.
 *
 * Pages written recently sit at the end of the file, so the tail is pulled in
 * one read and hops are served from it wherever they land inside — turning what
 * would be one round trip per page into one for the common case.
 */
async function readIndexChain(
    read: ReadRange,
    commit: CommitRecord,
): Promise<{ page: IndexPage; length: number }[]> {
    if (commit.indexOffset === 0) return [];

    const tailLength = Math.min(commit.fileSize - DATA_START, 1024 * 1024);
    const tailStart = commit.fileSize - tailLength;
    const tail = tailLength > 0 ? await read(tailStart, tailLength) : new Uint8Array(0);

    const inTail = (offset: number, len: number): Uint8Array | null =>
        offset >= tailStart && offset + len <= tailStart + tail.length
            ? tail.subarray(offset - tailStart, offset - tailStart + len)
            : null;

    const pages: { page: IndexPage; length: number }[] = [];
    const seen = new Set<number>();
    let offset = commit.indexOffset;

    while (offset !== 0) {
        // A cycle means a corrupt chain; stop rather than spin.
        if (seen.has(offset)) throw new Error("index chain loops");
        seen.add(offset);

        const cached = inTail(offset, BLOCK_HEADER_BYTES);
        const header = decodeBlockHeader(cached ?? (await read(offset, BLOCK_HEADER_BYTES)));
        if (!header || header.type !== BlockType.Index) throw new Error(`no index page at ${offset}`);

        const storedInTail = inTail(offset + BLOCK_HEADER_BYTES, header.length);
        const stored = storedInTail ?? (await read(offset + BLOCK_HEADER_BYTES, header.length));
        const page = JSON.parse(fflate.strFromU8(payloadOf(header, stored, offset))) as IndexPage;

        pages.push({ page, length: BLOCK_HEADER_BYTES + header.length });
        offset = page.prev;
    }

    return pages;
}

/**
 * Open a project file: header, resolved index, and how much of the file is
 * free space. Throws for anything that is not a readable file of this format,
 * which callers treat as "write it fresh" rather than as data loss.
 */
export async function openProjectFile(read: ReadRange, fileSize: number): Promise<ProjectFile> {
    const header = readHeader(await read(0, DATA_START));
    if (!header) throw new Error("not a scriptio project file");

    // A file longer than the commit says has a partial save at the end. That is
    // the expected shape after a crash, and those bytes are unreachable, so the
    // recorded size is the truth about where the file ends.
    const commit = { ...header.commit, fileSize: Math.min(header.commit.fileSize, fileSize) };
    const index = resolveIndex(await readIndexChain(read, commit));

    const freeBytes = Math.max(0, commit.fileSize - liveBytesOf(index));

    return {
        identity: header.identity,
        commit,
        writeSlot: header.writeSlot,
        index,
        freeBytes,
        freeFraction: commit.fileSize > 0 ? freeBytes / commit.fileSize : 0,
    };
}

/** Every live document update, merged into one. */
export async function readDocumentUpdate(
    read: ReadRange,
    file: ProjectFile,
): Promise<Uint8Array | null> {
    if (file.index.updates.length === 0) return null;

    const updates: Uint8Array[] = [];
    for (const record of file.index.updates) updates.push(await readBlock(read, record.off));

    const { mergeUpdates } = await import("yjs");
    return updates.length === 1 ? updates[0] : mergeUpdates(updates);
}

/** One asset's bytes. Reads that asset's range and nothing else. */
export async function readAssetBytes(
    read: ReadRange,
    file: ProjectFile,
    hash: string,
): Promise<Uint8Array | null> {
    const record = file.index.assets.get(hash);
    return record ? readBlock(read, record.off) : null;
}
