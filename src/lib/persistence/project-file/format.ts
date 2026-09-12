/**
 * The `.scenarly` bound-file format: an append-only log of blocks.
 *
 * A bound project is saved every few idle seconds, forever, and may hold
 * gigabytes of board images. So the format has one job above all others: **a
 * save must cost what the user changed, not what the project weighs.**
 * Everything below follows from that.
 *
 * ── Byte map ─────────────────────────────────────────────────────────────────
 *
 *   0    IDENTITY        64 B   written once, at creation, never again
 *   64   COMMIT slot A   32 B   ─┐ one of these is in force; a save writes
 *   96   COMMIT slot B   32 B   ─┘ the other, then it is
 *   128  blocks…                appended, never rewritten, never moved
 *
 *   IDENTITY
 *     0   char[8]  "SCENARLY" — sniffed by the open flow; the extension is
 *                  shared with the ZIP export and proves nothing
 *     8   u16      format version
 *     10  u16      flags, reserved
 *     12  u32      identity size, so a later version may grow past 64
 *     16  u32      CRC-32 over bytes 0..15
 *
 *   COMMIT (each slot)
 *     0   u64      generation — higher wins; this is what elects a slot
 *     8   u64      offset of the newest index page (0 = no blocks yet)
 *     16  u64      file size as of this commit
 *     24  u32      CRC-32 over bytes 0..23
 *     28  u32      reserved
 *
 *   BLOCK (before every payload)
 *     0   u32      "SBLK"
 *     4   u16      type: 1 asset, 2 update, 3 index
 *     6   u16      flags: bit 0 = payload is deflated
 *     8   u64      payload bytes as stored
 *     16  u64      payload bytes once inflated
 *     24  u32      CRC-32 of the stored payload
 *     28  u32      reserved
 *
 * All integers little-endian.
 *
 * ── Why the commit record is separate, and doubled ───────────────────────────
 *
 * Identity never changes, so it is written once and left alone. What *does*
 * change on every save is a pointer: each save appends a new index page, and
 * something has to say which one is newest, or a reader would have to scan the
 * whole file to find out. That pointer is the commit — the blocks appended
 * before it are inert until it lands, which is what makes an interrupted save
 * harmless.
 *
 * Because it is rewritten, it is the one thing here that can tear. So there are
 * two slots: a save writes the *older* one and bumps its generation, leaving the
 * newer one in force untouched throughout. Each carries a checksum, so a
 * half-written slot fails to decode instead of reading as a plausible pointer
 * into nonsense. The reader takes the valid slot with the higher generation.
 *
 * ── Why a chained index ──────────────────────────────────────────────────────
 *
 * One index rewritten per save would cost a record per entry every time, whether
 * or not anything about that entry changed — a thousand images taxing every
 * keystroke, which is the ZIP central-directory tax this format exists to avoid.
 * Instead each index page carries only what *changed* plus the offset of the page
 * before it. Adding an asset writes one record; removing one writes a tombstone
 * and no data at all. Reading walks the chain newest-first, and the first record
 * for a key wins.
 *
 * ── What is not here ─────────────────────────────────────────────────────────
 *
 * Compression of assets (they arrive already compressed), and any notion of
 * overwriting. Space is only ever reclaimed by a whole-file rewrite — the rare
 * operation, never on the save path.
 *
 * This is the *working* format. Export still produces the ZIP archive, which is
 * what gets shared and what any machine can open with ordinary tools.
 */

export const FILE_MAGIC = new Uint8Array([0x53, 0x43, 0x45, 0x4e, 0x41, 0x52, 0x4c, 0x59]); // "SCENARLY"
export const FORMAT_VERSION = 1;

/** Written once, at creation. Padded so a later version can grow into it. */
export const IDENTITY_BYTES = 64;
/** One commit slot. Two of them follow the identity. */
export const COMMIT_BYTES = 32;
/** Identity plus both commit slots; the first block starts here. */
export const DATA_START = IDENTITY_BYTES + COMMIT_BYTES * 2;

export const BLOCK_HEADER_BYTES = 32;
const BLOCK_MAGIC = 0x4b4c4253; // "SBLK"

export enum BlockType {
    Asset = 1,
    Update = 2,
    Index = 3,
}

const FLAG_DEFLATED = 1;

// ── CRC-32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

const viewOf = (data: Uint8Array): DataView =>
    new DataView(data.buffer, data.byteOffset, data.byteLength);

// ── Identity ──────────────────────────────────────────────────────────────────

export interface FileIdentity {
    version: number;
}

export function encodeIdentity(identity: FileIdentity): Uint8Array {
    const out = new Uint8Array(IDENTITY_BYTES);
    const dv = viewOf(out);
    out.set(FILE_MAGIC, 0);
    dv.setUint16(8, identity.version, true);
    dv.setUint16(10, 0, true); // flags, reserved
    dv.setUint32(12, IDENTITY_BYTES, true);
    dv.setUint32(16, crc32(out.subarray(0, 16)), true);
    return out;
}

/** Decode the identity, or null for anything that is not one of our files. */
export function decodeIdentity(head: Uint8Array): FileIdentity | null {
    if (head.length < IDENTITY_BYTES) return null;
    for (let i = 0; i < FILE_MAGIC.length; i++) if (head[i] !== FILE_MAGIC[i]) return null;

    const dv = viewOf(head);
    if (dv.getUint32(16, true) !== crc32(head.subarray(0, 16))) return null;

    return { version: dv.getUint16(8, true) };
}

// ── Commit records ────────────────────────────────────────────────────────────

export interface CommitRecord {
    /**
     * Higher wins, and that is its whole job — it makes "which slot is newest"
     * decidable from the two records alone, where a timestamp could not (a file
     * has one mtime, and a torn record cannot announce itself).
     *
     * A u64 read through `Number`, so it stays exact to 2^53. At one save every
     * three seconds that is some nine hundred million years, which is not a
     * ceiling worth engineering around.
     */
    generation: number;
    /** Offset of the newest index page, or 0 for a file with no blocks yet. */
    indexOffset: number;
    /**
     * File size as of this commit. A file longer than this has a partial commit
     * at the end — the expected shape after a crash — and those bytes are
     * unreachable, so this is the truth about where the file ends.
     */
    fileSize: number;
}

export function encodeCommit(commit: CommitRecord): Uint8Array {
    const out = new Uint8Array(COMMIT_BYTES);
    const dv = viewOf(out);
    dv.setBigUint64(0, BigInt(commit.generation), true);
    dv.setBigUint64(8, BigInt(commit.indexOffset), true);
    dv.setBigUint64(16, BigInt(commit.fileSize), true);
    dv.setUint32(24, crc32(out.subarray(0, 24)), true);
    return out;
}

/**
 * Decode one slot, or null when it is empty or half-written.
 *
 * The checksum is what makes the two-slot scheme work: without it a torn record
 * is 32 bytes of plausible-looking data — half the old values, half the new —
 * and the reader would follow a corrupted offset into nonsense.
 */
export function decodeCommit(slot: Uint8Array): CommitRecord | null {
    if (slot.length < COMMIT_BYTES) return null;

    const dv = viewOf(slot);
    if (dv.getUint32(24, true) !== crc32(slot.subarray(0, 24))) return null;

    return {
        generation: Number(dv.getBigUint64(0, true)),
        indexOffset: Number(dv.getBigUint64(8, true)),
        fileSize: Number(dv.getBigUint64(16, true)),
    };
}

export const commitSlotOffset = (slot: 0 | 1): number => IDENTITY_BYTES + slot * COMMIT_BYTES;

/**
 * The file's identity, the commit in force, and the slot the next save must
 * write. `head` must be the file's first {@link DATA_START} bytes.
 *
 * Null means this is not a readable project file — wrong magic, or both commit
 * slots unusable.
 */
export function readHeader(
    head: Uint8Array,
): { identity: FileIdentity; commit: CommitRecord; writeSlot: 0 | 1 } | null {
    const identity = decodeIdentity(head);
    if (!identity) return null;

    const a = decodeCommit(head.subarray(commitSlotOffset(0), commitSlotOffset(1)));
    const b = decodeCommit(head.subarray(commitSlotOffset(1), DATA_START));
    if (!a && !b) return null;

    // The newer slot is in force, so the older one is the safe place to write:
    // it is not what a reader would pick if this commit never finishes.
    if (a && (!b || a.generation >= b.generation)) return { identity, commit: a, writeSlot: 1 };
    return { identity, commit: b!, writeSlot: 0 };
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export interface BlockHeader {
    type: BlockType;
    /** Payload bytes as stored. */
    length: number;
    /** Payload bytes once inflated; equal to `length` when not deflated. */
    uncompressedLength: number;
    deflated: boolean;
    crc: number;
}

export function encodeBlock(
    type: BlockType,
    stored: Uint8Array,
    uncompressedLength: number,
    deflated: boolean,
): Uint8Array {
    const out = new Uint8Array(BLOCK_HEADER_BYTES + stored.length);
    const dv = viewOf(out);
    dv.setUint32(0, BLOCK_MAGIC, true);
    dv.setUint16(4, type, true);
    dv.setUint16(6, deflated ? FLAG_DEFLATED : 0, true);
    dv.setBigUint64(8, BigInt(stored.length), true);
    dv.setBigUint64(16, BigInt(uncompressedLength), true);
    dv.setUint32(24, crc32(stored), true);
    dv.setUint32(28, 0, true); // reserved
    out.set(stored, BLOCK_HEADER_BYTES);
    return out;
}

export function decodeBlockHeader(header: Uint8Array): BlockHeader | null {
    if (header.length < BLOCK_HEADER_BYTES) return null;
    const dv = viewOf(header);
    if (dv.getUint32(0, true) !== BLOCK_MAGIC) return null;

    return {
        type: dv.getUint16(4, true) as BlockType,
        deflated: (dv.getUint16(6, true) & FLAG_DEFLATED) !== 0,
        length: Number(dv.getBigUint64(8, true)),
        uncompressedLength: Number(dv.getBigUint64(16, true)),
        crc: dv.getUint32(24, true),
    };
}

// ── Index pages ───────────────────────────────────────────────────────────────

/**
 * One asset, one document update, or the removal of an asset.
 *
 * JSON rather than a packed encoding: a page written on the save path holds one
 * or two of these, and even a full page for a project with thousands of assets
 * is a rounding error beside the assets themselves. Being able to read the index
 * of a damaged file with a text editor is worth more than the bytes.
 */
export type IndexRecord =
    | {
          k: "a";
          hash: string;
          /** Offset and total size of the block, header included. */
          off: number;
          len: number;
          mime: string;
          w: number;
          h: number;
          size: number;
      }
    | { k: "u"; seq: number; off: number; len: number }
    /** The asset with this hash is no longer part of the project. */
    | { k: "d"; hash: string };

export interface IndexPage {
    /** Offset of the page written before this one, or 0 at the head of a chain. */
    prev: number;
    records: IndexRecord[];
}

/** What a walk of the whole chain resolves to. */
export interface ResolvedIndex {
    /** Live assets by hash. */
    assets: Map<string, Extract<IndexRecord, { k: "a" }>>;
    /** Live document updates, oldest first. */
    updates: Extract<IndexRecord, { k: "u" }>[];
    /** How many pages the chain holds; drives compaction as much as free space does. */
    pages: number;
    /** Bytes held by index pages themselves — live, since the chain needs them. */
    indexBytes: number;
}

/**
 * Fold a chain into what it means, newest page first.
 *
 * First record for a key wins, which is what makes the log work: a later page
 * saying "this asset is gone" is read before the page that added it, and a
 * re-added asset's newer record shadows its own tombstone.
 */
export function resolveIndex(pages: { page: IndexPage; length: number }[]): ResolvedIndex {
    const assets = new Map<string, Extract<IndexRecord, { k: "a" }>>();
    const dead = new Set<string>();
    const updates: Extract<IndexRecord, { k: "u" }>[] = [];
    let indexBytes = 0;

    for (const { page, length } of pages) {
        indexBytes += length;
        for (const record of page.records) {
            if (record.k === "d") {
                if (!assets.has(record.hash)) dead.add(record.hash);
            } else if (record.k === "a") {
                if (!assets.has(record.hash) && !dead.has(record.hash)) assets.set(record.hash, record);
            } else {
                updates.push(record);
            }
        }
    }

    // Pages arrive newest-first, so updates came out in reverse write order.
    updates.sort((a, b) => a.seq - b.seq);
    return { assets, updates, pages: pages.length, indexBytes };
}

/**
 * Bytes the file needs. Anything else in it is free space to be reclaimed.
 *
 * Computed from the resolved index rather than carried in the commit record: by
 * the time anyone asks, the index is in hand, and a stored total is one more
 * number that can drift out of step with what the file actually holds.
 */
export function liveBytesOf(index: ResolvedIndex): number {
    let total = DATA_START + index.indexBytes;
    for (const asset of index.assets.values()) total += asset.len;
    for (const update of index.updates) total += update.len;
    return total;
}
