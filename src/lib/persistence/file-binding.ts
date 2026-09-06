/**
 * The third save target: a `.scriptio` file on disk that Scriptio keeps up to
 * date on its own.
 *
 * Local (IndexedDB) and cloud are unconditional; this one is opt-in and per
 * project. While a project is *bound*, every idle moment writes the whole
 * project back to its file, so the user owns a real, portable copy of their work
 * without ever thinking about saving.
 *
 * Two rules shape everything here, and both come from the same place — a file is
 * a channel other programs can write to as well:
 *
 *  · **A save appends; only rarely does it rewrite.** The common path adds the
 *    document delta and any new asset to the end of the file, so it costs the
 *    edit rather than the project (see project-file/). A whole-file rewrite is
 *    the fallback — and what folds the index chain back down and reclaims free
 *    space — so it is expensive, and it is not a merge. Hence the debounce, the
 *    state-vector skip, and the temp-and-rename around the rewrite.
 *  · **The file may have moved on since we last wrote it** — a sync client, a
 *    second machine, another instance, a restored backup. Writing blindly then
 *    discards whatever the other side put there while the local project looks
 *    perfectly healthy, which is the one way this feature could lose work
 *    without anything appearing wrong. So every write fingerprints the target
 *    first, and merges rather than clobbers.
 *
 * Desktop only. Web has no path to write back to, and iOS hands out
 * security-scoped URLs rather than paths; on both, the affordance is absent
 * rather than disabled.
 */

import { isTauri } from "@tauri-apps/api/core";
import * as Y from "yjs";

import { isIOS, isAndroid } from "@src/lib/utils/platform";
import { applyDocumentUpdate } from "@src/lib/adapters/scriptio/scriptio-open";
import { withProjectDoc } from "@src/lib/project/project-state";
import {
    bindProjectFile,
    getCachedProject,
    getCachedProjects,
    recordFileWrite,
    unbindProjectFile,
    type FileFingerprint,
} from "./storage-provider/local-persistence";
import {
    armProjectLog,
    commitProjectUpdates,
    pendingProjectUpdate,
    releaseProjectLog,
} from "./update-log";
import { collectReferencedHashes } from "@src/lib/assets/asset-gc";
import type { ProjectFile } from "./project-file/reader";
import { restoreAssetsInto } from "./project-file/restore";
import {
    SUGGEST_COMPACT_FRACTION,
    appendSave,
    boundFileReader,
    openBoundFile,
    readBoundDocument,
    lineageOfUpdate,
    rewriteBoundFile,
    shouldFold,
} from "./project-file/store";

// ── Status ────────────────────────────────────────────────────────────────────

export type FileBindingStatus =
    /** No file is bound — the ordinary state, and the only one on web/mobile. */
    | { state: "unbound" }
    /** A write is in flight. The path rides along so the panel doesn't blink
     *  the filename out of existence for the duration of a save. */
    | { state: "saving"; path: string }
    /**
     * The file is up to date as of `at`.
     *
     * `freeFraction` is how much of it is space no longer accounted for —
     * deleted images, mostly. Removing an asset only writes a tombstone, so the
     * bytes stay until the file is compacted, and past a threshold the save
     * panel offers to do that. Absent when the last write did not measure it.
     */
    | { state: "saved"; path: string; at: number; freeFraction?: number }
    /** The path no longer resolves: moved, deleted, or its volume unmounted. */
    | { state: "missing"; path: string }
    /** Writing is stopped and needs the user: permissions, or a foreign file. */
    | { state: "error"; path: string; message: string };

/**
 * Shared so the hook's SSR snapshot is *referentially* the store's default —
 * two identical literals is exactly how that stops being true, and
 * `useSyncExternalStore` compares by identity.
 */
export const UNBOUND: FileBindingStatus = { state: "unbound" };

/** Why a path cannot be bound, or what the user has to agree to first. */
export type BindRefusal =
    /** Another project in this library already writes to this path. */
    | { kind: "path-taken"; projectId: string; title: string }
    /** A different project's file is already here; binding destroys it. */
    | { kind: "replaces-foreign-file" }
    /** The OS said no — read-only volume, permissions, a bad directory. */
    | { kind: "not-writable"; message: string };

/** Idle gap before a write. Long enough that typing never triggers one. */
const WRITE_DEBOUNCE_MS = 3_000;

// ── Module state ──────────────────────────────────────────────────────────────

interface BindingEntry {
    status: FileBindingStatus;
    timer: ReturnType<typeof setTimeout> | null;
    /** The write currently in flight, so flushes queue behind it. */
    inFlight: Promise<void> | null;
    /**
     * Has the document changed since the last successful write?
     *
     * Not redundant with the state-vector check below. Deleting content consumes
     * no clock, so a document whose only change is a deletion has exactly the
     * state vector it had before — judged on vectors alone, cutting a scene and
     * saving would look like a no-op and the file would silently keep the scene.
     */
    dirty: boolean;
    /**
     * Bumped on every local edit, and compared across a write.
     *
     * A write is not instantaneous: the bytes are built from a snapshot of the
     * document and can take seconds on a project with assets. Anything edited in
     * that window is not in the bytes being written, so clearing `dirty` on
     * completion would drop it — and for a deletion, which moves no clock, the
     * state vector cannot notice either. Comparing revisions clears `dirty` only
     * for the changes the write actually captured.
     */
    revision: number;
}

const bindings = new Map<string, BindingEntry>();
const subscribers = new Set<() => void>();

/** True where a project can be backed by a file at all. */
export const isFileBindingSupported = (): boolean => isTauri() && !isIOS() && !isAndroid();

const notify = (): void => subscribers.forEach((cb) => cb());

/** Subscribe to any binding's status changing (drives `useSyncExternalStore`). */
export function subscribeFileBindings(callback: () => void): () => void {
    subscribers.add(callback);
    return () => {
        subscribers.delete(callback);
    };
}

/**
 * The most recent explicit save (⌘S), so the UI can acknowledge it.
 *
 * The ambient status readout is not enough on its own here: a bound project that
 * was already up to date shows "saved" before and after the keystroke, so
 * pressing Save would appear to do nothing at all. One value, not a per-project
 * map — only one project is on screen at a time.
 */
let manualSave: { projectId: string; path: string } | null = null;
let manualSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** How long the acknowledgement stays up. Long enough to read, short enough not
 *  to linger over the title the user is about to click back into. */
const MANUAL_SAVE_FLASH_MS = 2_500;

export function markManualSave(projectId: string): void {
    const status = getFileBindingStatus(projectId);
    if (status.state === "unbound") return;

    manualSave = { projectId, path: status.path };
    if (manualSaveTimer) clearTimeout(manualSaveTimer);
    // Expiry lives here rather than in a component effect so the acknowledgement
    // is plain derived state on the reading side — nothing to copy, nothing to
    // clean up, and it survives the panel being hovered open and shut.
    manualSaveTimer = setTimeout(() => {
        manualSave = null;
        manualSaveTimer = null;
        notify();
    }, MANUAL_SAVE_FLASH_MS);
    notify();
}

export function getManualSave(projectId: string): { path: string } | null {
    return manualSave?.projectId === projectId ? manualSave : null;
}

/** Free space at which the save panel offers to compact the file. */
export { SUGGEST_COMPACT_FRACTION };

/** Current status for a project. `unbound` for anything this module hasn't loaded. */
export function getFileBindingStatus(projectId: string): FileBindingStatus {
    return bindings.get(projectId)?.status ?? UNBOUND;
}

const setStatus = (projectId: string, status: FileBindingStatus): void => {
    const entry = bindings.get(projectId);
    if (!entry) return;
    entry.status = status;
    notify();
};

const entryFor = (projectId: string): BindingEntry => {
    const existing = bindings.get(projectId);
    if (existing) return existing;

    const created: BindingEntry = {
        status: UNBOUND,
        timer: null,
        inFlight: null,
        dirty: false,
        revision: 0,
    };
    bindings.set(projectId, created);
    return created;
};

// ── Filesystem helpers ────────────────────────────────────────────────────────

/**
 * Dynamically imported so the Tauri plugin never lands in the web bundle's
 * initial graph — the same shape `save-file.ts` uses.
 */
const fs = () => import("@tauri-apps/plugin-fs");

/**
 * Did the sandbox refuse this path, rather than the filesystem?
 *
 * The fs plugin only permits paths the user has granted — normally by picking
 * them in a dialog, which grants for that session and (via persisted-scope)
 * across restarts. A binding can still outlive its grant: the app was
 * reinstalled, the scope file was cleared, or the binding predates persistence.
 *
 * That is not the same failure as a missing file, and it has a real fix — point
 * at the file again and the dialog re-grants it — so it gets its own state
 * rather than being swallowed as a generic error. Matched on the message
 * because the plugin surfaces it as a plain string, with no error code to test.
 */
const isAccessDenied = (error: unknown): boolean =>
    error instanceof Error
        ? error.message.includes("forbidden path")
        : typeof error === "string" && error.includes("forbidden path");

/** Status for a binding whose path we are no longer allowed to touch. */
const NO_ACCESS = "no-access";

const fingerprintOf = (info: { mtime: Date | null; size: number }): FileFingerprint => ({
    mtimeMs: info.mtime?.getTime() ?? 0,
    size: info.size,
});

const sameFingerprint = (a?: FileFingerprint, b?: FileFingerprint): boolean =>
    !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;

/** Filename component of a path, for UI that shows the file rather than the path. */
export const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() || path;

/**
 * A path on one line, with the *front* dropped when it is too long.
 *
 * The end is the part worth keeping — the filename, and the folder it sits in —
 * so a plain end-ellipsis would truncate away exactly what the user is looking
 * for. Wrapping was worse still: a path broken mid-segment across two lines
 * reads as a typo. Callers pass a budget because the surfaces differ, and both
 * keep the full path available as a tooltip.
 */
export const shortenPath = (path: string, maxChars: number): string =>
    path.length <= maxChars ? path : `…${path.slice(path.length - maxChars + 1)}`;

/**
 * Scratch paths granted this session, so the grant is asked for once per file
 * rather than once per save. Each grant pushes a pattern onto the fs scope and
 * every later scope check walks that list, so re-granting on each autosave would
 * grow it without bound over a long writing session.
 */
const grantedScratchPaths = new Map<string, string>();

/**
 * Where this target's scratch file goes, asking the backend to permit it the
 * first time.
 *
 * The scratch sibling is not a path the user picked, and the file dialog grants
 * fs scope for exactly the path it returned — so writing to it is refused
 * outright ("forbidden path: …scriptio.part"). `allow_scratch_file` grants it,
 * but only for a target that is itself already granted, which keeps intact the
 * rule the scope exists to enforce.
 */
async function scratchPathFor(path: string): Promise<string | null> {
    const cached = grantedScratchPaths.get(path);
    if (cached) return cached;

    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const scratch = await invoke<string>("allow_scratch_file", { path });
        grantedScratchPaths.set(path, scratch);
        return scratch;
    } catch (error) {
        console.warn("[file-binding] could not reserve a scratch file:", error);
        return null;
    }
}

/**
 * Write `bytes` to `path` so that a reader never sees a half-written file.
 *
 * Used only by the whole-file rewrite, which replaces live bytes: a crash or a
 * pulled cable partway through a direct write would leave a truncated file where
 * the project used to be. Writing a sibling scratch file and renaming it over
 * the target makes the swap atomic — the rename either happened or it didn't.
 * (An append needs none of this: it writes past everything a reader can reach,
 * and the commit record it flips last is what adopts the new bytes.)
 *
 * Windows' `rename` refuses to replace an existing file, so a failure there
 * falls back to removing the target first. That window is small and, unlike the
 * truncation it replaces, leaves the scratch file intact to rename in.
 *
 * If the scratch file cannot be had at all, the save still happens — directly,
 * and non-atomically. Losing the crash guarantee is bad; not saving the user's
 * work is worse.
 */
async function writeFileAtomic(path: string, bytes: Uint8Array): Promise<void> {
    const { writeFile, rename, remove, exists } = await fs();
    const tempPath = await scratchPathFor(path);

    if (!tempPath) {
        await writeFile(path, bytes);
        return;
    }

    try {
        await writeFile(tempPath, bytes);
    } catch (error) {
        console.warn("[file-binding] scratch file rejected, writing in place:", error);
        grantedScratchPaths.delete(path);
        await writeFile(path, bytes);
        return;
    }

    try {
        await rename(tempPath, path);
    } catch {
        if (await exists(path)) await remove(path);
        try {
            await rename(tempPath, path);
        } catch (error) {
            await remove(tempPath).catch(() => {});
            throw error;
        }
    }
}

/**
 * Has the document moved since the state vector we last wrote?
 *
 * Compared as decoded clock maps rather than as bytes: the encoding orders
 * clients by insertion, so two runs over the same state can differ in bytes
 * while describing the same thing, and a byte compare would rewrite the whole
 * file for nothing.
 */
function stateVectorMoved(doc: Y.Doc, lastWritten?: Uint8Array): boolean {
    if (!lastWritten) return true;

    let previous: Map<number, number>;
    try {
        previous = Y.decodeStateVector(lastWritten);
    } catch {
        return true;
    }

    const current = Y.decodeStateVector(Y.encodeStateVector(doc));
    if (current.size !== previous.size) return true;
    for (const [client, clock] of current) {
        if (previous.get(client) !== clock) return true;
    }
    return false;
}

// ── The writer ────────────────────────────────────────────────────────────────

/** How much of the bound file is reclaimable, or undefined if we cannot tell. */
async function freeSpaceOf(path: string): Promise<number | undefined> {
    try {
        const { stat } = await fs();
        return (await openBoundFile(path, (await stat(path)).size)).freeFraction;
    } catch {
        return undefined;
    }
}

/** The lineage of the document at `path`, or null if it holds none we can read. */
async function lineageAt(path: string, fileSize: number): Promise<string | null> {
    const file = await openBoundFile(path, fileSize);
    const update = await readBoundDocument(path, file);
    return update ? lineageOfUpdate(update) : null;
}

/**
 * Take in whatever the file holds that we don't, before overwriting it.
 *
 * This is the mirror of "never blind-overwrite the local project": the file may
 * have changed since our last write, and overwriting it would discard
 * those changes silently. Reading it back and merging first is what makes a
 * `.scriptio` in a sync folder behave like a slow sync channel instead of a
 * footgun.
 *
 * Returns false when the writer must stop: the file at our path belongs to a
 * different document, which means someone replaced it and only the user can say
 * what should happen next.
 */
async function absorbExternalChanges(
    projectId: string,
    path: string,
    localLineage: string | undefined,
): Promise<boolean> {
    const { stat } = await fs();

    // Ranges, not the whole file: the document is kilobytes however many
    // gigabytes of images sit beside it, and this runs whenever a sync client
    // has touched the file.
    let source: { file: ProjectFile; lineage: string | null; update: Uint8Array | null } | null = null;
    try {
        const file = await openBoundFile(path, (await stat(path)).size);
        const update = await readBoundDocument(path, file);
        source = { file, update, lineage: update ? lineageOfUpdate(update) : null };
    } catch {
        // Not a readable project file at all — treated as foreign, same as a
        // lineage mismatch. Overwriting a file we cannot even parse is exactly
        // the blind write this rule exists to prevent.
        source = null;
    }

    if (!source?.lineage || !source.update || !localLineage || source.lineage !== localLineage) {
        setStatus(projectId, { state: "error", path, message: "foreign-file" });
        return false;
    }

    // Same document: fold it in. `applyDocumentUpdate` does the version
    // alignment and the rollback snapshot, so nothing extra is needed here; the
    // callback brings back the images, which live outside the CRDT.
    const { file, update } = source;
    await applyDocumentUpdate(projectId, update, {}, (id) => restoreAssetsInto(id, boundFileReader(path), file));

    // Whatever is at this path is not what we last wrote, so the rewrite below
    // has to happen even if the merge brought in nothing. Without this, a file
    // replaced by an *older* copy of the same project would merge to a no-op,
    // fail the state-vector check, and be left stale forever — with every later
    // save re-reading it and skipping again.
    const entry = bindings.get(projectId);
    if (entry) entry.dirty = true;

    return true;
}

/**
 * Try to save by appending, and say whether it worked.
 *
 * False is never a failure — it means "this save has to rewrite the file",
 * and every reason for it is ordinary: the log cannot vouch for itself (a fresh
 * session, an overflow, a write that failed), the file has accumulated enough
 * orphaned directories to be worth compacting, or it is not in a shape this
 * writer may extend. The rewrite that follows folds the log back in, so falling
 * back is also how the file gets tidied.
 *
 * Note what an *empty* log does not mean. Entries only arrive from a live
 * session's update observer, so a project with no session open — one being
 * merged into by `absorbExternalChanges`, say — changes without the log hearing
 * about it. An empty log therefore says "I have nothing to add", never "nothing
 * changed"; the second question is the state vector's to answer, and it is asked
 * on the whole-file path this returns to.
 *
 * Both markers are sampled in the same synchronous breath as the log, exactly as
 * the whole-file path does: the log holds every update applied to the
 * document since the base was written, so at this instant `base + log` *is* the
 * document, and a state vector taken here describes precisely what will be on
 * disk.
 */
async function tryAppendSave(
    projectId: string,
    entry: BindingEntry,
    path: string,
): Promise<boolean> {
    const pending = pendingProjectUpdate(projectId);
    if (pending.kind !== "update") return false;

    const { stat } = await fs();

    let file: ProjectFile;
    try {
        file = await openBoundFile(path, (await stat(path)).size);
    } catch {
        // Not in this format yet, or unreadable: the rewrite that follows puts
        // it in one.
        return false;
    }

    // Every save adds an index page, and opening walks the chain. Folding it
    // back down is a whole rewrite, so it is deliberately rare — but it has to
    // happen, or a long writing session makes the next open slow.
    if (shouldFold(file)) return false;

    const { stateVector, revision, assets } = await withProjectDoc(projectId, (doc) => ({
        stateVector: Y.encodeStateVector(doc),
        revision: entry.revision,
        assets: collectReferencedHashes(doc),
    }));

    let freeFraction: number;
    try {
        ({ freeFraction } = await appendSave(path, projectId, file, {
            referenced: assets,
            update: pending.update,
        }));
    } catch (error) {
        // A file we could not extend is not a save we failed: the caller
        // rewrites it whole, which fixes whatever this tripped over.
        console.warn("[file-binding] could not append, rewriting whole:", error);
        return false;
    }

    const written = fingerprintOf(await stat(path));
    await recordFileWrite(projectId, stateVector, written);
    commitProjectUpdates(projectId, pending.through);
    if (entry.revision === revision) entry.dirty = false;

    setStatus(projectId, { state: "saved", path, at: Date.now(), freeFraction });
    return true;
}

/** Perform one write, doing every safety check on the way. */
async function performWrite(projectId: string): Promise<void> {
    const entry = bindings.get(projectId);
    if (!entry) return;

    const row = await getCachedProject(projectId);
    const path = row?.filePath;
    if (!path) {
        entry.status = UNBOUND;
        notify();
        return;
    }

    const { exists, stat } = await fs();
    setStatus(projectId, { state: "saving", path });

    try {
        // Health check — but only once there is something to be missing. A path
        // we have never written to is a "Save as…" destination that simply does
        // not exist yet; a path we *have* written to and that has stopped
        // resolving is a moved file or an unmounted volume, and re-creating our
        // copy there would strand it at a stale location while the real file
        // lives on elsewhere. Inside the try because `exists` can itself be
        // refused, and an unhandled rejection out of the debounce timer would
        // leave the status stuck on "saving".
        const present = await exists(path);
        if (!present && row.fileLastWriteAt !== undefined) {
            setStatus(projectId, { state: "missing", path });
            return;
        }

        // What we believe is on disk. Advanced as external writes are taken in,
        // so the pre-swap check below compares against the newest thing we have
        // seen rather than re-detecting a change we already merged.
        let expected = row.fileFingerprint;

        /**
         * Fold in anything written to the file behind our back, and say what was
         * found. Run twice per write — see the second call site for why once is
         * not enough.
         */
        const reconcile = async (): Promise<"unchanged" | "absorbed" | "foreign"> => {
            if (!expected || !(await exists(path))) return "unchanged";

            const onDisk = fingerprintOf(await stat(path));
            if (sameFingerprint(onDisk, expected)) return "unchanged";

            const localLineage = await withProjectDoc(projectId, (doc) =>
                doc.metadata().get("lineageId"),
            );
            if (!(await absorbExternalChanges(projectId, path, localLineage))) return "foreign";

            expected = onDisk;
            return "absorbed";
        };

        if ((await reconcile()) === "foreign") return;

        // The cheap path. Everything above has established that the file is
        // where we left it, so the only thing it lacks is what has been typed
        // since — which the log already holds, and which appends in a write
        // proportional to the edit rather than to the project.
        if (present && (await tryAppendSave(projectId, entry, path))) return;

        // The whole-file write: create the file, fold a long index chain back
        // down, or reclaim free space. Everything it needs is sampled in one
        // synchronous pass so the markers describe exactly the document being
        // written — see the log and revision notes below.
        const snapshot = await withProjectDoc(projectId, (doc) => {
            // The skip: rewriting an unchanged project would re-emit every
            // asset for nothing. `dirty` covers the edits a state vector cannot
            // see (see BindingEntry.dirty).
            if (!entry.dirty && !stateVectorMoved(doc, row.fileLastWriteSv)) return null;

            // `encodeStateAsUpdate`, not a readable export: a snapshot without
            // the CRDT could never merge back into the project that wrote it.
            const update = Y.encodeStateAsUpdate(doc);
            const stateVector = Y.encodeStateVector(doc);
            const revision = entry.revision;
            const assets = collectReferencedHashes(doc);
            // The log starts here too, for the same reason: this document state
            // is what the file is about to hold, so from this instant the log
            // accumulates exactly what the file will be missing. Armed before
            // the write rather than after it because the write is not
            // instantaneous — anything typed while it runs belongs in the log.
            armProjectLog(projectId);

            return { update, stateVector, revision, assets };
        });

        if (!snapshot) {
            setStatus(projectId, { state: "saved", path, at: row.fileLastWriteAt ?? Date.now() });
            return;
        }
        const { update, stateVector, revision, assets } = snapshot;

        // Look again before replacing. The check above happened before a build
        // that takes as long as the project is big, so on a large project it is
        // the *stalest* moment to have decided this — and a sync client writing
        // into that window would be overwritten by a decision made before its
        // change existed. Absorbed here, the bytes in hand already predate the
        // merge, so they are dropped and the debounce comes round again rather
        // than replacing the file with something known to be behind.
        const late = await reconcile();
        if (late === "foreign") return;
        if (late === "absorbed") {
            setStatus(projectId, { state: "saved", path, at: row.fileLastWriteAt ?? Date.now() });
            scheduleFileWrite(projectId);
            return;
        }

        // Unlike an append, this replaces live bytes, so it goes through the
        // scratch file and a rename — the only way to swap a whole file without
        // a window where it is neither the old one nor the new one.
        await rewriteBoundFile(path, projectId, update, assets, (bytes) =>
            writeFileAtomic(path, bytes),
        );

        // Fingerprint what we just left behind, so the next write can tell our
        // own handiwork from somebody else's.
        const written = fingerprintOf(await stat(path));
        await recordFileWrite(projectId, stateVector, written);
        // Only what the snapshot captured is on disk. An edit made while it was
        // being built bumped the revision and must stay dirty — the state vector
        // will not speak for it if it was a deletion.
        if (entry.revision === revision) entry.dirty = false;

        // A fresh file has no free space by construction, so the panel's
        // compaction card goes away on any whole-file write.
        setStatus(projectId, { state: "saved", path, at: Date.now(), freeFraction: 0 });
    } catch (error) {
        console.error("[file-binding] write failed:", error);
        // The log was armed against a document state that never reached the
        // disk, so it no longer describes the gap between the file and the
        // project. Drop it: an incomplete log must send the next write to the
        // whole-document fallback, not quietly under-report.
        releaseProjectLog(projectId);
        setStatus(projectId, {
            state: "error",
            path,
            message: isAccessDenied(error)
                ? NO_ACCESS
                : error instanceof Error
                  ? error.message
                  : String(error),
        });
    }
}

/** Serialise writes per project: a flush during a write waits for it, then runs. */
function enqueueWrite(projectId: string): Promise<void> {
    const entry = entryFor(projectId);
    const run = (entry.inFlight ?? Promise.resolve())
        .catch(() => {})
        .then(() => performWrite(projectId));

    entry.inFlight = run.finally(() => {
        if (entry.inFlight === run) entry.inFlight = null;
    });
    return entry.inFlight;
}

/**
 * Note that the document changed and start (or restart) the idle timer.
 *
 * Called from the project session's update observer, so it fires on every
 * keystroke — hence doing nothing but resetting a timer.
 */
export function scheduleFileWrite(projectId: string): void {
    const entry = bindings.get(projectId);
    if (!entry || entry.status.state === "unbound") return;

    entry.dirty = true;
    entry.revision += 1;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
        entry.timer = null;
        void enqueueWrite(projectId);
    }, WRITE_DEBOUNCE_MS);
}

/**
 * Write now and wait for it. Used by ⌘S, by closing a project, and by quitting —
 * the moments where "in three seconds" is not good enough.
 */
export async function flushNow(projectId: string): Promise<void> {
    const entry = bindings.get(projectId);
    if (!entry || entry.status.state === "unbound") return;

    if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
    await enqueueWrite(projectId);
}

/** Flush every bound project. Wired to window blur and to app quit. */
async function flushAllFileBindings(): Promise<void> {
    await Promise.all([...bindings.keys()].map((id) => flushNow(id)));
}

// ── Binding lifecycle ─────────────────────────────────────────────────────────

/**
 * Window-level hooks, installed once the first binding is loaded.
 *
 * The debounce alone is not a save policy: it only fires while the app keeps
 * running and the user keeps idling. Blur covers "switched to another app to
 * look at the file", and `beforeunload` covers quitting and reloading — the two
 * moments a three-second wait would be visibly wrong. Focus re-checks health
 * because a user coming back from a file manager may well have moved the file.
 */
let windowHooksInstalled = false;

function installWindowHooks(): void {
    if (windowHooksInstalled || typeof window === "undefined") return;
    windowHooksInstalled = true;

    window.addEventListener("blur", () => {
        void flushAllFileBindings();
    });
    window.addEventListener("focus", () => {
        for (const projectId of bindings.keys()) void checkFileBindingHealth(projectId);
    });
    // Best-effort: the write is async and the page may go before it lands, but
    // the debounce is usually already past by the time anyone quits.
    window.addEventListener("beforeunload", () => {
        void flushAllFileBindings();
    });
}

/**
 * Adopt the binding recorded for a project, if any, so its status is live and
 * its writer armed. Called when a project session starts.
 */
export async function loadFileBinding(projectId: string): Promise<void> {
    if (!isFileBindingSupported()) return;
    installWindowHooks();

    const row = await getCachedProject(projectId);
    const entry = entryFor(projectId);

    if (!row?.filePath) {
        entry.status = UNBOUND;
        notify();
        return;
    }

    const { exists } = await fs();
    try {
        entry.status = (await exists(row.filePath))
            ? {
                  state: "saved",
                  path: row.filePath,
                  at: row.fileLastWriteAt ?? row.fileBoundAt ?? Date.now(),
                  // Measured on open so the compaction card is there when the
                  // project comes up, not only after the next save. Costs the
                  // header and the index chain — kilobytes — never an asset.
                  freeFraction: await freeSpaceOf(row.filePath),
              }
            : { state: "missing", path: row.filePath };
    } catch (error) {
        // The binding outlived its permission. Surfacing it as a problem state
        // is the whole point: silently leaving the project "unbound" would show
        // no file at all while the row still names one, and the user would have
        // no idea their saves had stopped.
        if (!isAccessDenied(error)) throw error;
        entry.status = { state: "error", path: row.filePath, message: NO_ACCESS };
    }
    notify();
}

/**
 * Re-check a bound file's existence. Cheap, and worth doing whenever the window
 * regains focus: the user has very likely been in a file manager.
 */
async function checkFileBindingHealth(projectId: string): Promise<void> {
    const entry = bindings.get(projectId);
    if (!entry || entry.status.state === "unbound") return;

    const row = await getCachedProject(projectId);
    if (!row?.filePath) {
        entry.status = UNBOUND;
        notify();
        return;
    }

    const { exists } = await fs();
    let present: boolean;
    try {
        present = await exists(row.filePath);
    } catch (error) {
        if (!isAccessDenied(error)) throw error;
        setStatus(projectId, { state: "error", path: row.filePath, message: NO_ACCESS });
        return;
    }

    if (!present) {
        setStatus(projectId, { state: "missing", path: row.filePath });
    } else if (entry.status.state === "missing") {
        // It came back — an unmounted volume, or an undone move.
        setStatus(projectId, {
            state: "saved",
            path: row.filePath,
            at: row.fileLastWriteAt ?? Date.now(),
        });
    }
}

/**
 * Is `path` bindable to `projectId`, and at what cost?
 *
 * Returns null when it is simply fine. Note what is *not* checked: whether the
 * user may edit the project. Binding writes a copy out; it does not modify the
 * project, so it stays available to viewers like every other non-destructive
 * action.
 */
export async function checkBindTarget(projectId: string, path: string): Promise<BindRefusal | null> {
    const projects = await getCachedProjects();
    const owner = projects.find((p) => p.id !== projectId && p.filePath === path);
    if (owner) return { kind: "path-taken", projectId: owner.id, title: owner.title };

    const { exists, stat } = await fs();

    if (await exists(path)) {
        let info: Awaited<ReturnType<typeof stat>>;
        try {
            info = await stat(path);
            if (info.readonly) return { kind: "not-writable", message: "read-only" };
        } catch (error) {
            return { kind: "not-writable", message: error instanceof Error ? error.message : String(error) };
        }

        // An existing `.scriptio` from a different document is somebody's
        // project file. The OS "replace?" prompt does not convey that binding
        // here destroys it, so ask separately.
        try {
            const fileLineage = await lineageAt(path, info.size);
            const localLineage = await withProjectDoc(projectId, (doc) => doc.metadata().get("lineageId"));
            if (fileLineage && fileLineage !== localLineage) return { kind: "replaces-foreign-file" };
        } catch {
            // Unreadable or not a project file — nothing to warn about beyond
            // the OS prompt the caller already showed.
        }
    }

    return null;
}

/**
 * Bind `projectId` to `path` and arm the writer.
 *
 * When the file already exists and holds the same document, its contents are
 * merged in *before* the first write, so re-binding to a copy that has moved on
 * (another machine, a restored backup) picks up its edits instead of erasing
 * them. When it exists but is foreign, the caller is expected to have taken
 * confirmation via {@link checkBindTarget}; recording its fingerprint as ours
 * makes the first write a deliberate replacement rather than a surprise merge.
 */
export async function bindProject(projectId: string, path: string): Promise<void> {
    if (!isFileBindingSupported()) return;

    const { exists, stat } = await fs();
    let initial: FileFingerprint | undefined;

    if (await exists(path)) {
        try {
            const localLineage = await withProjectDoc(projectId, (doc) => doc.metadata().get("lineageId"));
            const file = await openBoundFile(path, (await stat(path)).size);
            const update = await readBoundDocument(path, file);
            const fileLineage = update ? lineageOfUpdate(update) : null;

            // Binding to a copy of this same project — synced from another
            // machine, restored from a backup — adopts what it holds rather than
            // erasing it. A foreign file is left to the confirmation the caller
            // has already taken, and simply replaced by the first write.
            if (update && fileLineage && fileLineage === localLineage) {
                await applyDocumentUpdate(projectId, update, {}, (id) =>
                    restoreAssetsInto(id, boundFileReader(path), file),
                );
            }
        } catch (error) {
            console.warn("[file-binding] could not read the file being bound:", error);
        }
        initial = fingerprintOf(await stat(path));
    }

    await bindProjectFile(projectId, path, initial);

    const entry = entryFor(projectId);
    entry.dirty = true;
    entry.status = { state: "saved", path, at: Date.now() };
    notify();

    await flushNow(projectId);
}

/** Stop writing to the file and forget it. The file itself is left alone. */
export async function unbindProject(projectId: string): Promise<void> {
    const entry = bindings.get(projectId);
    if (entry?.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
    const row = await getCachedProject(projectId);
    if (row?.filePath) grantedScratchPaths.delete(row.filePath);

    await unbindProjectFile(projectId);
    releaseProjectLog(projectId);
    if (entry) {
        entry.status = UNBOUND;
        entry.dirty = false;
    }
    notify();
}

/**
 * Reclaim the file's free space, on the user's say-so.
 *
 * Deleting an image writes a tombstone and leaves its bytes where they are —
 * that is what makes the delete cheap, and what leaves a file that can be much
 * larger than the project inside it. This is the other half of that bargain:
 * lay the file out again with only what is live, which is the same whole-file
 * write a fold does.
 *
 * Offered rather than done automatically, because the cost is proportional to
 * the project and the benefit is disk space the user may not care about. The
 * panel raises it past {@link SUGGEST_COMPACT_FRACTION}; this performs it.
 */
export async function compactFileBinding(projectId: string): Promise<void> {
    const entry = bindings.get(projectId);
    if (!entry || entry.status.state === "unbound") return;

    const row = await getCachedProject(projectId);
    if (!row?.filePath) return;

    if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }

    // Marking it dirty is what sends the next write down the whole-file path,
    // which *is* compaction — so this reuses every check that write already
    // does (the external-change reconcile, the lineage guard, the log arming)
    // rather than opening a second way to replace the file.
    entry.dirty = true;
    releaseProjectLog(projectId);
    await enqueueWrite(projectId);
}

/** Drop a project's in-memory writer state (its session is going away). */
export function releaseFileBinding(projectId: string): void {
    const entry = bindings.get(projectId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    bindings.delete(projectId);
    releaseProjectLog(projectId);
    notify();
}
