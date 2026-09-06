/**
 * The bound project file on disk: opening it, saving into it, compacting it.
 *
 * Everything above this line is pure ({@link ./format}, {@link ./writer}) or
 * source-agnostic ({@link ./reader}); this is where it meets a real path and the
 * two Tauri commands that seek into it. Nothing here ever holds the file — the
 * whole design exists so that a save on a project with gigabytes of board images
 * reads a few kilobytes and writes a few more.
 */

import * as Y from "yjs";

import { ProjectState } from "@src/lib/project/project-doc";

import { getStorageProvider } from "../storage-provider/storage-provider";
import { DATA_START, type ResolvedIndex } from "./format";
import {
    openProjectFile,
    readDocumentUpdate,
    type ProjectFile,
    type ReadRange,
} from "./reader";
import {
    bytesHeldBy,
    materialise,
    planAppend,
    planRewrite,
    type AssetInput,
    type WritePlan,
} from "./writer";

/**
 * When the file should be rewritten rather than appended to.
 *
 * Free space is the user's business — it is what the panel offers to reclaim,
 * and reclaiming it is their call, not ours. Page count is ours: every save adds
 * an index page, and opening walks the chain, so this is the ceiling on how slow
 * an open is allowed to get before a save quietly tidies up.
 */
export const MAX_INDEX_PAGES = 200;
/** Free space at which the panel starts suggesting a compaction. */
export const SUGGEST_COMPACT_FRACTION = 0.2;

const tauriInvoke = async () => (await import("@tauri-apps/api/core")).invoke;

/**
 * Range reads against a real file, for the readers in {@link ./reader}.
 *
 * The command hands back an `ArrayBuffer`. Tauri only sends a raw body when the
 * value *is* binary — anything nested in a JSON object is re-encoded as an array
 * of numbers, so a megabyte of index would arrive as several megabytes of text.
 */
export const boundFileReader =
    (path: string): ReadRange =>
    async (offset, len) => {
        const invoke = await tauriInvoke();
        const buffer = await invoke<ArrayBuffer>("read_file_range", {
            path,
            offset,
            len: Math.max(0, len),
        });
        return new Uint8Array(buffer);
    };

/**
 * Write bytes at an offset, optionally dropping everything past them.
 *
 * The bytes go as the payload itself, for the same reason: passing them as one
 * field of an args object would turn a board image into megabytes of JSON on
 * every save. That leaves the scalars to travel as headers, and the path is
 * percent-encoded so a filename outside ASCII survives being one.
 */
const write = async (
    path: string,
    offset: number,
    bytes: Uint8Array,
    truncate: boolean,
): Promise<void> => {
    const invoke = await tauriInvoke();
    await invoke("write_file_at", bytes, {
        headers: {
            "x-path": encodeURIComponent(path),
            "x-offset": String(offset),
            "x-truncate": truncate ? "1" : "0",
        },
    });
};

/**
 * Apply a plan in order, syncing between the writes.
 *
 * The first write extends the file with blocks nothing points at yet; the last
 * adopts them by flipping a commit record. Stopping between the two is safe by
 * construction, so this deliberately does not try to be atomic.
 */
async function commit(path: string, plan: WritePlan): Promise<void> {
    for (const op of plan.writes) {
        // Only the write that extends the file truncates: the commit record
        // lands in a fixed slot and must not shorten anything.
        await write(path, op.offset, op.bytes, op.offset >= DATA_START);
    }
}

/** Open the bound file. Throws for anything not readable as one. */
export async function openBoundFile(path: string, fileSize: number): Promise<ProjectFile> {
    return openProjectFile(boundFileReader(path), fileSize);
}

/** The document the file holds, as a single Yjs update. */
export async function readBoundDocument(
    path: string,
    file: ProjectFile,
): Promise<Uint8Array | null> {
    return readDocumentUpdate(boundFileReader(path), file);
}

/** Load the assets a rewrite needs, in index order so the layout is stable. */
async function assetsFor(projectId: string, hashes: Iterable<string>): Promise<AssetInput[]> {
    const provider = await getStorageProvider();
    const inputs: AssetInput[] = [];

    for (const hash of hashes) {
        const stored = await provider.getAsset(projectId, hash);
        if (!stored) continue; // referenced but not stored locally — same as export
        inputs.push({
            hash,
            bytes: new Uint8Array(stored.data),
            mime: stored.mime,
            width: stored.width,
            height: stored.height,
            size: stored.size,
        });
    }

    return inputs;
}

/**
 * Write the file from scratch: create it, or compact it.
 *
 * They are the same operation, which is why compaction needs no special case —
 * the result is every live asset once, the document as one update, and a
 * single-page index with no free space.
 *
 * The one expensive write in the design, so it happens where a wait is expected:
 * binding, closing, or a compaction the user asked for. It goes through a
 * scratch file and a rename because unlike an append it *replaces* live bytes,
 * and a rename is the only way to do that without a window where the file is
 * neither the old thing nor the new one.
 */
export async function rewriteBoundFile(
    path: string,
    projectId: string,
    update: Uint8Array,
    hashes: Iterable<string>,
    writeWhole: (bytes: Uint8Array) => Promise<void>,
): Promise<{ fileSize: number }> {
    const plan = planRewrite(await assetsFor(projectId, hashes), update);
    await writeWhole(materialise(plan));

    return { fileSize: plan.fileSize };
}

export interface SaveChanges {
    /** Hashes the project references now. */
    referenced: Set<string>;
    /** The document delta to append; null appends nothing but asset changes. */
    update: Uint8Array | null;
}

/**
 * Append one save.
 *
 * The asset diff is decided from hashes alone — content addressing means a hash
 * *is* the bytes, so a name comparison settles what changed and only a genuinely
 * new asset is ever read out of local storage. A removal reads nothing and
 * writes a tombstone, whatever the asset weighed.
 *
 * Returns the file's new shape so the caller can record a fingerprint and tell
 * the panel how much free space there now is, without reopening anything.
 */
export async function appendSave(
    path: string,
    projectId: string,
    file: ProjectFile,
    changes: SaveChanges,
): Promise<{ fileSize: number; freeFraction: number }> {
    const added = [...changes.referenced].filter((hash) => !file.index.assets.has(hash));
    const removed = [...file.index.assets.keys()].filter((hash) => !changes.referenced.has(hash));

    const plan = planAppend(file.commit, file.writeSlot, {
        assets: await assetsFor(projectId, added),
        removed,
        update: changes.update ?? undefined,
        seq: nextSeq(file.index),
    });

    await commit(path, plan);

    // Free space, counted in one place: what was live, plus what this save
    // added, less what its tombstones just orphaned. The starting figure comes
    // off the open rather than being recomputed — `openProjectFile` already
    // walked the index to derive it.
    const liveBytes =
        file.commit.fileSize - file.freeBytes + plan.addedBytes - bytesHeldBy(file.index, removed);
    const freeBytes = Math.max(0, plan.fileSize - liveBytes);

    return {
        fileSize: plan.fileSize,
        freeFraction: plan.fileSize > 0 ? freeBytes / plan.fileSize : 0,
    };
}

const nextSeq = (index: ResolvedIndex): number =>
    index.updates.reduce((highest, update) => Math.max(highest, update.seq), 0) + 1;

/** Has the chain grown far enough that a save should fold it back down? */
export const shouldFold = (file: ProjectFile): boolean => file.index.pages >= MAX_INDEX_PAGES;

/**
 * The lineage of a document a bound file holds, for the merge checks.
 *
 * Takes the update rather than re-reading it: every caller has just read the
 * document for its own reasons, and reading it again means a range read per
 * block and a second merge. `ProjectState` owns where `lineageId` lives, so this
 * does not hardcode the metadata key.
 */
export function lineageOfUpdate(update: Uint8Array): string | null {
    const doc = new ProjectState();
    try {
        Y.applyUpdate(doc, update);
        return doc.metadata().get("lineageId") ?? null;
    } finally {
        doc.destroy();
    }
}
