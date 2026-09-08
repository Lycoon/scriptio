/**
 * Device-local version history: the scheduler that takes the snapshots, the
 * pruner that keeps them bounded, and the restore that puts one back.
 *
 * This is the local twin of what the `ProjectRoom` DurableObject does for cloud
 * projects — the same tiers, the same asset rule, the same "a snapshot is a
 * whole document, not a diff" — with a Cloudflare Alarm replaced by a timer and
 * R2 by two IndexedDB stores. The point of mirroring it so closely is that
 * version history should not mean something different depending on where the
 * project happens to live; the point of it existing at all is that a local-only
 * project has no server holding a copy of yesterday's draft.
 *
 * Two things are deliberately *not* the same as the cloud:
 *
 *  · **Restore takes a snapshot of the present first.** The DurableObject keeps
 *    the live document in its own SQLite, so a restore the user regrets is still
 *    recoverable there. On this side there is no such backstop — replacing the
 *    document is the only copy of it going away — so the restore itself writes
 *    the version it is about to replace.
 *  · **The history has a byte budget.** See LOCAL_SNAPSHOT_BUDGET_BYTES.
 */

import * as Y from "yjs";

import { collectReferencedHashes, SkipGcError } from "../assets/asset-refs";
import { sha256Hex } from "../assets/asset-hash";
import { gcProjectAssets, scheduleAssetGc } from "../assets/asset-gc";
import { getLiveProjectDoc, restoreLocalDocument, withProjectDoc } from "../project/project-state";
import { releaseProjectLog } from "../persistence/update-log";
import {
    getStorageProvider,
    type SnapshotMeta,
} from "../persistence/storage-provider/storage-provider";
import { LOCAL_SNAPSHOT_BUDGET_BYTES, selectExpiredAutoSaves } from "./retention";
import type { SaveEntry } from "./types";

/**
 * Gap between an edit and the auto-snapshot that captures it — the same minute
 * the DurableObject's alarm uses.
 *
 * Timed from the *first* edit since the last snapshot, not restarted by each
 * one. A debounce would be the wrong shape here: a writer in the middle of a
 * two-hour session never goes idle for a minute, and that is precisely the
 * session whose history matters most.
 */
const LOCAL_SNAPSHOT_INTERVAL_MS = 60_000;

interface SnapshotEntry {
    dirty: boolean;
    timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Projects whose scheduler is running. Membership is the gate: only local-only
 * projects are ever added (see `startLocalSnapshots`), so a cloud project's
 * edits fall out of `notifyLocalSnapshotEdit` on its first line and its history
 * stays the server's business.
 */
const tracked = new Map<string, SnapshotEntry>();

/**
 * Serialises snapshot work per project, so a manual save and a scheduled one
 * cannot both be encoding the same document, and a prune never runs against a
 * listing the write beside it is about to invalidate.
 */
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const run = (queues.get(projectId) ?? Promise.resolve()).catch(() => {}).then(fn);
    queues.set(projectId, run);
    void run.catch(() => {}).finally(() => {
        if (queues.get(projectId) === run) queues.delete(projectId);
    });
    return run;
}

/**
 * The update's bytes as a buffer of exactly that length.
 *
 * IndexedDB stores a whole ArrayBuffer, not the view over it, so handing it
 * `bytes.buffer` from a view into a larger allocation would persist trailing
 * bytes that `Y.applyUpdate` then has to survive on the way back. Yjs happens to
 * return exactly-sized arrays today; this makes the snapshot not depend on that.
 */
const exactBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : (bytes.slice().buffer as ArrayBuffer);

const toSaveEntry = (meta: SnapshotMeta): SaveEntry => ({
    key: meta.key,
    type: meta.type,
    name: meta.name,
    date: new Date(meta.createdAt).toISOString(),
    size: meta.size,
});

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Encode the project's current document and store it as one history entry —
 * unless the history already ends with exactly this document.
 *
 * The asset hashes are collected in the same pass, while the document is
 * already decoded — the reason the DurableObject indexes them at write time
 * too. Doing it later would mean decoding every snapshot on every GC sweep.
 *
 * **The skip.** A snapshot is a whole document (400KB for a feature screenplay),
 * so writing one that duplicates the newest entry costs the history a full copy
 * and buys a timestamp. The scheduler's dirty flag already prevents the common
 * case — with no edit it never even arms a timer, so nothing is encoded and
 * nothing is hashed — but it cannot decide this one, and not merely because the
 * unconditional callers (the pre-restore backup, the close flush) can run with
 * no session to hold a flag.
 *
 * The flag answers "did this tab observe a local edit". The question here is
 * "does the history already hold this document", and that one outlives the
 * session the flag lives in. Reload a page 30 seconds after a snapshot and the
 * flag starts clean while the stored document is half a minute ahead of the
 * history; a restore trusting it would skip the backup and then `clearData()`
 * those 30 seconds out of existence, which is the one thing the pre-restore
 * snapshot exists to prevent. Comparing state vectors instead — `file-binding`'s
 * cheaper trick — fails the same way round: deletions consume no clock, so
 * cutting a scene leaves the vector untouched and the backup skipped.
 *
 * Only the newest entry is compared against, deliberately. Matching against the
 * whole history would also dedupe a document that returns to an older state, but
 * then the entry standing in for it is one retention may prune on age — and the
 * content would go with it, having never been re-recorded. The newest entry
 * carries no such debt.
 *
 * Manual saves are never skipped. The user asked for a named marker at this
 * moment; the name is new even when the bytes are not, and a Save button that
 * silently does nothing is worse than a duplicate.
 */
async function captureSnapshot(
    projectId: string,
    type: "auto" | "manual",
    name?: string,
): Promise<SaveEntry> {
    const captured = await withProjectDoc(projectId, (doc) => {
        const update = Y.encodeStateAsUpdate(doc);
        try {
            return { update, assetHashes: [...collectReferencedHashes(doc)], assetsUnparsed: false };
        } catch (e) {
            if (e instanceof SkipGcError) return { update, assetHashes: [], assetsUnparsed: true };
            throw e;
        }
    });

    const data = exactBuffer(captured.update);
    const contentHash = await sha256Hex(data);
    const provider = await getStorageProvider();

    if (type === "auto") {
        // Metadata only, and `listSnapshots` already sorts newest first — the
        // comparison costs one index read, never a snapshot decode.
        const [newest] = await provider.listSnapshots(projectId);
        if (newest?.contentHash === contentHash) return toSaveEntry(newest);
    }

    const now = new Date();
    const meta: SnapshotMeta = {
        key: `${projectId}/${type}/${now.toISOString()}`,
        projectId,
        type,
        ...(name !== undefined && { name }),
        createdAt: now.getTime(),
        size: captured.update.byteLength,
        contentHash,
        assetHashes: captured.assetHashes,
        ...(captured.assetsUnparsed && { assetsUnparsed: true }),
    };

    await provider.putSnapshot(meta, data);
    return toSaveEntry(meta);
}

/** Take an automatic snapshot now, whatever the scheduler was going to do. */
export function writeAutoSnapshot(projectId: string): Promise<SaveEntry> {
    return enqueue(projectId, () => captureSnapshot(projectId, "auto"));
}

/** Take a named snapshot the user asked for. Never pruned. */
export function writeManualSnapshot(projectId: string, name: string): Promise<SaveEntry> {
    return enqueue(projectId, () => captureSnapshot(projectId, "manual", name));
}

// ── Pruning ──────────────────────────────────────────────────────────────────

/**
 * Apply the retention tiers (and the byte budget) to a project's auto-saves,
 * then reclaim whatever assets that freed.
 *
 * Only auto-saves are considered: a manual save is a version the user named, so
 * nothing here may decide it has expired — which also keeps it out of the budget
 * arithmetic entirely.
 */
export async function pruneLocalSnapshots(projectId: string): Promise<void> {
    const provider = await getStorageProvider();
    const snapshots = await provider.listSnapshots(projectId);
    const expired = selectExpiredAutoSaves(
        snapshots.filter((s) => s.type === "auto"),
        Date.now(),
        { budgetBytes: LOCAL_SNAPSHOT_BUDGET_BYTES },
    );
    if (expired.length === 0) return;

    await provider.deleteSnapshots(expired);
    // Dropping a snapshot is the one moment an asset can stop being referenced
    // without the user touching a card, so reconcile now rather than waiting for
    // the next project open — the DurableObject's `triggerAssetGc()` after its
    // own retention pass.
    await reconcileAssets(projectId);
}

/**
 * Delete one history entry on the user's say-so, and reclaim whatever it was
 * the last thing holding on to. The same pairing as the DurableObject's delete
 * handler — an entry leaving the history is an asset becoming collectable.
 */
export async function deleteLocalSnapshot(projectId: string, key: string): Promise<void> {
    const provider = await getStorageProvider();
    await provider.deleteSnapshots([key]);
    await reconcileAssets(projectId);
}

/**
 * Run asset GC against whichever document is available.
 *
 * The debounced scheduler holds the doc it was handed for a second and a half,
 * so it can only be given the live session's — a temporary replica would be
 * destroyed out from under it. With no session open there is nothing to
 * coalesce with anyway, so the sweep runs inline instead.
 */
async function reconcileAssets(projectId: string): Promise<void> {
    const live = getLiveProjectDoc(projectId);
    if (live) {
        scheduleAssetGc(projectId, live);
        return;
    }
    await withProjectDoc(projectId, (doc) => gcProjectAssets(projectId, doc));
}

// ── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Begin taking automatic snapshots of a project. Called once its session is
 * ready, and only for local-only projects.
 */
export function startLocalSnapshots(projectId: string): void {
    if (tracked.has(projectId)) return;
    tracked.set(projectId, { dirty: false, timer: null });
}

/**
 * Note that the document changed.
 *
 * Runs on every keystroke of a local project, so it does nothing but set a flag
 * and — at most once per interval — arm a timer.
 */
export function notifyLocalSnapshotEdit(projectId: string): void {
    const entry = tracked.get(projectId);
    if (!entry) return;

    entry.dirty = true;
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
        entry.timer = null;
        void takeScheduledSnapshot(projectId, entry).catch((e) =>
            console.warn("[saves] auto-snapshot failed:", e),
        );
    }, LOCAL_SNAPSHOT_INTERVAL_MS);
}

async function takeScheduledSnapshot(projectId: string, entry: SnapshotEntry): Promise<void> {
    if (!entry.dirty) return;
    entry.dirty = false;
    await captureSnapshotAndPrune(projectId);
}

async function captureSnapshotAndPrune(projectId: string): Promise<void> {
    await enqueue(projectId, async () => {
        await captureSnapshot(projectId, "auto");
        await pruneLocalSnapshots(projectId);
    });
}

/**
 * Capture anything the pending timer hasn't yet. Closing a project is exactly
 * when the last minute of work should already be in its history.
 */
export async function flushLocalSnapshots(projectId: string): Promise<void> {
    const entry = tracked.get(projectId);
    if (!entry) return;

    if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
    if (!entry.dirty) return;
    entry.dirty = false;
    await captureSnapshotAndPrune(projectId);
}

/** Stop scheduling for a project — its session is going away. */
export function releaseLocalSnapshots(projectId: string): void {
    const entry = tracked.get(projectId);
    if (entry?.timer) clearTimeout(entry.timer);
    tracked.delete(projectId);
}

/**
 * Throw away a project's device-local history, because the cloud owns its
 * versions now.
 *
 * This has to be reachable from more than the promotion that causes it, because
 * nothing else in this module will ever touch those rows again: retention runs
 * only from the scheduler, the scheduler starts only for local-only projects, so
 * a snapshot that outlives its project's promotion is never pruned, never ages
 * out, and is never listed — while asset GC goes on honouring its `assetHashes`
 * forever. Two ways that happens, neither of them exotic: a promotion that fails
 * after flipping the flag (the asset upload aborts on a quota error), and a
 * second tab, whose `tracked` map is its own and which keeps snapshotting a
 * project it still believes is local. So this also runs on project open.
 *
 * Reclaiming the assets is half the point — those hashes were the only thing
 * keeping some of them alive.
 */
export async function discardLocalSnapshots(projectId: string): Promise<void> {
    releaseLocalSnapshots(projectId);

    // Cheap enough to run on every cloud project's open: an index read that
    // finds nothing costs one transaction and no writes.
    const provider = await getStorageProvider();
    if ((await provider.listSnapshots(projectId)).length === 0) return;

    await provider.deleteProjectSnapshots(projectId);
    await reconcileAssets(projectId);
}

// ── Restore ──────────────────────────────────────────────────────────────────

/**
 * Put a stored version back, everywhere this device keeps the project.
 *
 * The ordering is the whole substance of this function, and every step of it is
 * about a copy of the document that would otherwise be left behind:
 *
 *  1. Snapshot the present first — see the header. A restore is destructive and
 *     this is the only thing that makes it reversible.
 *  2. Drop the bound file's update log. It describes the document being
 *     replaced, and appending it to the file would splice the old edits back on
 *     top of the restored ones. Releasing it is also what makes the writer take
 *     the whole-file path (`pendingProjectUpdate` → `unavailable`) — the file's
 *     blocks are additive, so a restore *has* to rewrite rather than append.
 *  3. Replace the local document (and the session holding it).
 *  4. Rewrite the file now, before the reload takes the page away. The explicit
 *     `scheduleFileWrite` marks the binding dirty so the writer's state-vector
 *     skip can't decide this is a no-op — a restore usually moves the document
 *     *backwards*, which no state vector can see.
 *
 * Steps 2 and 4 no-op on web and mobile, where nothing is ever file-bound.
 *
 * Split from the reload that follows it because the two are not the same kind of
 * step: everything here is a change to what this device has stored, awaitable
 * and checkable, while the reload is an unrecoverable hand-off to the browser
 * that cannot be intercepted (`location.reload` is non-configurable). Keeping
 * them apart is what lets the restore be exercised without navigating away.
 */
export async function applyLocalSnapshotRestore(projectId: string, key: string): Promise<void> {
    const provider = await getStorageProvider();
    const data = await provider.getSnapshotData(key);
    if (!data) throw new Error(`Snapshot not found: ${key}`);

    await writeAutoSnapshot(projectId);
    releaseLocalSnapshots(projectId);

    releaseProjectLog(projectId);
    await restoreLocalDocument(projectId, new Uint8Array(data));

    try {
        const { scheduleFileWrite, flushNow } = await import("../persistence/file-binding");
        scheduleFileWrite(projectId);
        await flushNow(projectId);
    } catch (e) {
        console.warn("[saves] failed to rewrite bound file after restore:", e);
    }
}

/**
 * Restore a stored version and show it.
 *
 * The reload is how the restored document reaches the screen: the editor is
 * bound to a Y.Doc that has just been thrown away, and a CRDT gives no way to
 * rewind the one it is holding. The cloud path arrives at the same place from
 * the other direction — the server closes every socket and each client reloads.
 */
export async function restoreLocalSnapshot(projectId: string, key: string): Promise<void> {
    await applyLocalSnapshotRestore(projectId, key);
    window.location.reload();
}
