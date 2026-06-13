import { EditorState, Transaction } from "@tiptap/pm/state";

/**
 * Performance instrumentation for ProseMirror plugin `apply` functions.
 *
 * The `apply` of every screenplay extension runs synchronously on each
 * transaction. Keeping them fast is what makes writing feel smooth, so this
 * helper wraps an `apply`, times it, and accumulates per-extension stats
 * (count / min / max / average / last) that the on-screen debug panel reads.
 *
 * Only *document-changing* transactions are measured. Selection-only
 * transactions (cursor movement, focus, hover) don't mutate the doc — every
 * extension early-returns its cached decorations in ~0ms — so measuring them
 * just floods the stats with meaningless near-zero samples. Restricting to
 * `tr.docChanged` keeps the numbers about actual edits, which is what matters
 * for typing smoothness.
 */
const APPLY_TIMING_ENABLED = process.env.NODE_ENV !== "production";

export interface ApplyStat {
    /** Number of measured (doc-changing) calls. */
    count: number;
    /** Fastest call, in milliseconds. */
    min: number;
    /** Slowest call, in milliseconds. */
    max: number;
    /** Sum of all durations — divide by `count` for the average. */
    sum: number;
    /** Most recent call's duration, in milliseconds. */
    last: number;
}

/** Per-extension stats, keyed by the name passed to `timeApply`. */
const stats = new Map<string, ApplyStat>();

/** A monotonically increasing token so subscribers can cheaply detect changes. */
let revision = 0;

/** Live (mutated in place) stats map. Treat as read-only from the outside. */
export const getApplyTimingStats = (): ReadonlyMap<string, ApplyStat> => stats;

/** Current revision — bumps on every recorded sample and on reset. */
export const getApplyTimingRevision = (): number => revision;

/** Clear all accumulated stats (wired to the panel's Reset button). */
export const resetApplyTimingStats = (): void => {
    stats.clear();
    revision++;
};

const record = (name: string, duration: number): void => {
    let stat = stats.get(name);
    if (!stat) {
        stat = { count: 0, min: Infinity, max: 0, sum: 0, last: 0 };
        stats.set(name, stat);
    }
    stat.count++;
    stat.sum += duration;
    stat.last = duration;
    if (duration < stat.min) stat.min = duration;
    if (duration > stat.max) stat.max = duration;
    revision++;
};

/**
 * Record a timing sample for something that isn't a plugin `apply` — e.g. the
 * whole-keydown duration measured by the debug panel. Feeds the same stats map
 * so it shows up as just another row, with min/max/avg/last and live updates.
 */
export const recordTiming = (name: string, durationMs: number): void => {
    if (!APPLY_TIMING_ENABLED) return;
    record(name, durationMs);
};

/** ProseMirror `StateField.apply` signature, generic over the field value. */
type ApplyFn<T> = (tr: Transaction, value: T, oldState: EditorState, newState: EditorState) => T;

/**
 * Wrap a plugin-state `apply` so doc-changing calls are timed and recorded.
 *
 * Usage — replace `apply(tr, value, oldState, newState) { ... }` with
 * `apply: timeApply("extension-name", (tr, value, oldState, newState) => { ... })`.
 */
export const timeApply = <T>(name: string, fn: ApplyFn<T>): ApplyFn<T> => {
    if (!APPLY_TIMING_ENABLED) return fn;

    return (tr, value, oldState, newState) => {
        // Skip selection-only transactions — see the file header for why.
        if (!tr.docChanged) return fn(tr, value, oldState, newState);

        const start = performance.now();
        const result = fn(tr, value, oldState, newState);
        record(name, performance.now() - start);
        return result;
    };
};
