/**
 * Page-locking primitives.
 *
 * Page locks are anchored to the top-level node that begins each locked page
 * (every screenplay node already carries a stable `data-id`). The first page
 * has no anchor node — it is keyed by the sentinel `PAGE_ONE_KEY` so the lock
 * map can always describe page 1 explicitly.
 *
 * Numbering uses the same `SceneToken` machinery as scene locking. We pass
 * the ordered list of page anchors to `computeSceneLabels`; locked pages get
 * their frozen token, intermediate provisional pages get suffix labels
 * ("4A", "4B"), and pages appended after the last lock get the next integer.
 *
 * Token math, label compilation, and order comparison all live in
 * `scene-locking.ts` and are re-used here unchanged.
 */

import type { SceneToken } from "./scene-locking";

/** Sentinel key used for the first page (which has no anchor node). */
export const PAGE_ONE_KEY = "__page1__";

export type PersistentPage = {
    /** Frozen structural position under production page-lock. */
    token?: SceneToken;
};

export type PersistentPageMap = { [anchorId: string]: PersistentPage };
