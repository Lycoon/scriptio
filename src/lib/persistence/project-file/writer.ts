/**
 * Building the bytes of a save.
 *
 * Two shapes only. An **append** puts new blocks and one index page at the end
 * of the file and then flips a commit record — the save path, and its cost is the
 * blocks it was given. A **rewrite** lays out a whole file from scratch — used
 * to create one, and to compact one, which is the only way free space is ever
 * reclaimed.
 *
 * Nothing here touches the filesystem: these functions return plans, so they can
 * be tested against arrays and driven by whichever backend the caller has.
 */

import * as fflate from "fflate";

import {
    BlockType,
    DATA_START,
    FORMAT_VERSION,
    type CommitRecord,
    type IndexPage,
    type IndexRecord,
    type ResolvedIndex,
    commitSlotOffset,
    encodeBlock,
    encodeCommit,
    encodeIdentity,
} from "./format";

/** An asset to store, with the metadata the index will carry for it. */
export interface AssetInput {
    hash: string;
    bytes: Uint8Array;
    mime: string;
    width: number;
    height: number;
    size: number;
}

/**
 * One contiguous run of bytes to write at an offset.
 *
 * A plan is a list of these rather than one buffer because a commit is
 * deliberately two writes: the data, then the commit record that adopts it.
 */
export interface WriteOp {
    offset: number;
    bytes: Uint8Array;
}

export interface WritePlan {
    /** In order. The last one is always the commit — see {@link planAppend}. */
    writes: WriteOp[];
    /** What the file measures once the plan has been applied. */
    fileSize: number;
    /**
     * Bytes of live data this plan adds. The caller pairs it with what the
     * removals freed to work out the file's new free space, which is the one
     * place that accounting lives.
     */
    addedBytes: number;
}

const deflate = (bytes: Uint8Array): { stored: Uint8Array; deflated: boolean } => {
    const packed = fflate.deflateSync(bytes, { level: 9 });
    return packed.length < bytes.length
        ? { stored: packed, deflated: true }
        : { stored: bytes, deflated: false };
};

const indexBlockOf = (page: IndexPage): Uint8Array => {
    const json = fflate.strToU8(JSON.stringify(page));
    const { stored, deflated } = deflate(json);
    return encodeBlock(BlockType.Index, stored, json.length, deflated);
};

/**
 * Assets are stored as they are. Images and audio arrive already compressed, so
 * a deflate pass costs CPU on the save path to save nothing — and the save path
 * is the one place in this design that is not allowed to be expensive.
 */
const assetBlockOf = (asset: AssetInput): Uint8Array =>
    encodeBlock(BlockType.Asset, asset.bytes, asset.bytes.length, false);

const updateBlockOf = (update: Uint8Array): Uint8Array => {
    const { stored, deflated } = deflate(update);
    return encodeBlock(BlockType.Update, stored, update.length, deflated);
};

/**
 * Append a save: any new assets, any removals, and the document update.
 *
 * The ordering is the crash-safety argument. Blocks and the new index page are
 * written past every byte a reader can currently reach, so until the final
 * write lands the file still resolves through the commit in force — which
 * this plan does not touch, because it writes the *other* slot. A commit that
 * stops halfway leaves a longer file whose tail nothing points at, and the
 * previous state intact.
 *
 * Removing an asset writes a tombstone and no data, so it costs one short index
 * record whatever the asset weighed.
 */
export function planAppend(
    current: CommitRecord,
    writeSlot: 0 | 1,
    changes: {
        assets?: AssetInput[];
        removed?: string[];
        update?: Uint8Array;
        /** Sequence for the update block; monotonic per file. */
        seq?: number;
    },
): WritePlan {
    const records: IndexRecord[] = [];
    const blocks: Uint8Array[] = [];
    let at = current.fileSize;
    let added = 0;

    for (const asset of changes.assets ?? []) {
        const block = assetBlockOf(asset);
        records.push({
            k: "a",
            hash: asset.hash,
            off: at,
            len: block.length,
            mime: asset.mime,
            w: asset.width,
            h: asset.height,
            size: asset.size,
        });
        blocks.push(block);
        at += block.length;
        added += block.length;
    }

    for (const hash of changes.removed ?? []) records.push({ k: "d", hash });

    if (changes.update) {
        const block = updateBlockOf(changes.update);
        records.push({ k: "u", seq: changes.seq ?? 0, off: at, len: block.length });
        blocks.push(block);
        at += block.length;
        added += block.length;
    }

    const indexBlock = indexBlockOf({ prev: current.indexOffset, records });
    const indexOffset = at;
    blocks.push(indexBlock);
    at += indexBlock.length;

    const commit: CommitRecord = {
        generation: current.generation + 1,
        indexOffset,
        fileSize: at,
    };

    return {
        writes: [
            { offset: current.fileSize, bytes: concat(blocks) },
            { offset: commitSlotOffset(writeSlot), bytes: encodeCommit(commit) },
        ],
        fileSize: at,
        addedBytes: added + indexBlock.length,
    };
}

/**
 * Lay out a whole file: every asset once, the document as a single update, and
 * one index page with no chain behind it.
 *
 * This is both "create" and "compact" — they are the same operation, which is
 * why compaction needs no special case. The result has no free space and a
 * one-page index, so the next open is one read of the tail.
 */
export function planRewrite(assets: AssetInput[], update: Uint8Array | null): WritePlan {
    const records: IndexRecord[] = [];
    const blocks: Uint8Array[] = [];
    let at = DATA_START;

    for (const asset of assets) {
        const block = assetBlockOf(asset);
        records.push({
            k: "a",
            hash: asset.hash,
            off: at,
            len: block.length,
            mime: asset.mime,
            w: asset.width,
            h: asset.height,
            size: asset.size,
        });
        blocks.push(block);
        at += block.length;
    }

    if (update) {
        const block = updateBlockOf(update);
        records.push({ k: "u", seq: 1, off: at, len: block.length });
        blocks.push(block);
        at += block.length;
    }

    const indexBlock = indexBlockOf({ prev: 0, records });
    const indexOffset = at;
    blocks.push(indexBlock);
    at += indexBlock.length;

    // Identity is written here and never again. Commit slot A holds the first
    // commit and slot B is left zeroed: with no valid second slot the reader
    // simply takes A, and the first save writes B.
    return {
        writes: [
            { offset: 0, bytes: encodeIdentity({ version: FORMAT_VERSION }) },
            {
                offset: commitSlotOffset(0),
                bytes: encodeCommit({ generation: 1, indexOffset, fileSize: at }),
            },
            { offset: DATA_START, bytes: concat(blocks) },
        ],
        fileSize: at,
        addedBytes: at - DATA_START,
    };
}

/** What the named assets occupy, per the index — the input to `removedBytes`. */
export function bytesHeldBy(index: ResolvedIndex, hashes: string[]): number {
    let total = 0;
    for (const hash of hashes) total += index.assets.get(hash)?.len ?? 0;
    return total;
}

/** The whole file's bytes, for tests and for writing a file in one go. */
export function materialise(plan: WritePlan): Uint8Array {
    const out = new Uint8Array(plan.fileSize);
    for (const write of plan.writes) out.set(write.bytes, write.offset);
    return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, part) => n + part.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}
