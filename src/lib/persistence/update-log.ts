/**
 * The per-transaction update log behind incremental file writes.
 *
 * A bound project's file holds a base document plus a log of Yjs updates
 * appended to it, so a save costs the bytes the user just typed rather than a
 * re-emission of the whole project. This module is where those bytes are kept
 * between the edit that produced them and the write that consumes them.
 *
 * **Why not just diff the document at write time.** `Y.encodeStateAsUpdate(doc,
 * sv)` looks like the natural way to produce "what the file is missing", and it
 * is what the writer falls back to — but it is the *catch a peer up from
 * scratch* API, so it carries the document's entire delete set every time (see
 * `hasOps` in scenarly-open). That term grows with the document's lifetime
 * deletion history, not with the edit, so a log built from it would grow at a
 * rate set by how much the script has ever been revised. The update handed to a
 * `doc.on("update")` observer carries only *that transaction's* structs and
 * deletions, which is exactly the log entry we want — so we keep them as they
 * are produced. It is the same thing `y-indexeddb` and `y-websocket` do.
 *
 * **Arming.** A log is only usable if it holds *everything* since the base it
 * will be appended to. That is not true by default: a session that has just
 * loaded has recorded nothing, and a buffer that hit its cap has dropped
 * entries. So a log has to be explicitly armed — by the writer, at the moment
 * the base becomes current — and it reports itself `unavailable` in every other
 * case, which sends the caller to the whole-document fallback rather than to a
 * silently short log.
 */

import * as Y from "yjs";

/**
 * Caps on what one project may buffer between writes.
 *
 * The point is bounded memory, not thrift: past these the log stops being the
 * cheap option anyway, and a state-vector diff is both smaller and definitely
 * complete. A project whose session is idle for a collaborator's long editing
 * run is the realistic way to reach them.
 */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_UPDATES = 2_000;

interface ProjectLog {
    updates: Uint8Array[];
    bytes: number;
    /** Set once entries have been dropped; the log can no longer be trusted. */
    overflowed: boolean;
}

const logs = new Map<string, ProjectLog>();

/** What the writer can do with a project's log right now. */
export type PendingUpdate =
    /** Nothing has changed since the base — there is nothing to append. */
    | { kind: "empty" }
    /** Not armed, or entries were dropped: fall back to a whole-document diff. */
    | { kind: "unavailable" }
    /**
     * The buffered updates, coalesced. `through` is how many entries went into
     * it, so a write that succeeds can drop exactly those and leave anything
     * recorded while it was in flight.
     */
    | { kind: "update"; update: Uint8Array; through: number };

/**
 * Start (or restart) recording for a project, declaring that its base is current
 * as of now. Called by the writer once the archive it will append to is on disk.
 */
export function armProjectLog(projectId: string): void {
    logs.set(projectId, { updates: [], bytes: 0, overflowed: false });
}

/**
 * Record one transaction's update.
 *
 * Runs on every keystroke of a bound project, so it does nothing but a map
 * lookup and a push. Unarmed projects — every project on web, and any desktop
 * project with no file bound — fall out on the first line.
 */
export function recordProjectUpdate(projectId: string, update: Uint8Array): void {
    const log = logs.get(projectId);
    if (!log || log.overflowed) return;

    log.updates.push(update);
    log.bytes += update.byteLength;

    if (log.bytes > MAX_BUFFERED_BYTES || log.updates.length > MAX_BUFFERED_UPDATES) {
        // Drop the contents rather than the flag: holding them would defeat the
        // cap, and the flag is what routes the next write to the fallback.
        log.updates = [];
        log.bytes = 0;
        log.overflowed = true;
    }
}

/**
 * The log as one update, ready to append. Does not clear it — see
 * {@link commitProjectUpdates}, which is what a *successful* write calls.
 */
export function pendingProjectUpdate(projectId: string): PendingUpdate {
    const log = logs.get(projectId);
    if (!log || log.overflowed) return { kind: "unavailable" };
    if (log.updates.length === 0) return { kind: "empty" };

    const through = log.updates.length;
    return { kind: "update", update: Y.mergeUpdates(log.updates.slice(0, through)), through };
}

/**
 * Drop the first `through` entries, the ones a write has just put on disk.
 *
 * Counted rather than cleared wholesale because a write is not instantaneous:
 * anything recorded while it was in flight is not in the bytes that landed and
 * has to survive into the next one. (The same reason the writer compares
 * `revision` before clearing its dirty flag.)
 */
export function commitProjectUpdates(projectId: string, through: number): void {
    const log = logs.get(projectId);
    if (!log || log.overflowed) return;

    const written = log.updates.splice(0, through);
    for (const update of written) log.bytes -= update.byteLength;
}

/** Stop recording and free the buffer. The project's session is going away. */
export function releaseProjectLog(projectId: string): void {
    logs.delete(projectId);
}
