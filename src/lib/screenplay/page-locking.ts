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

/** Transaction meta flag set by scene omit/unomit. The pagination plugin's
 *  `filterTransaction` normally rejects any local edit that makes a locked
 *  page anchor's data-id disappear (content must not cross a lock). Omitting a
 *  scene legitimately removes a whole scene — including any locked anchors
 *  inside it — so the omit transaction carries this flag to bypass that guard.
 *  The omit also re-homes the affected page locks so nothing is left orphaned. */
export const SCENE_OMIT_META = "scene-omit";

/** Transaction meta flag set by the Backspace handler when it collapses an
 *  emptied locked page (deletes the page's only, now-empty, anchor node and
 *  moves the cursor up to the previous page). Like SCENE_OMIT_META it lets the
 *  pagination `filterTransaction` allow a locked anchor's data-id to disappear.
 *  The lock itself is left in the map as an orphan so the page's frozen number
 *  is absorbed into the following page as a range instead of vanishing. */
export const PAGE_COLLAPSE_META = "page-collapse";

export type PersistentPage = {
    /** Frozen structural position under production page-lock. */
    token?: SceneToken;
    /** Character offset within the anchor node where the locked page begins.
     *  Set when the page was originally split mid-node at a sentence boundary
     *  (straddling dialogue/action). Preserves the split on recompute so the
     *  locked page doesn't inherit the whole anchor node and overflow into a
     *  phantom "A" page. */
    splitOffset?: number;
};

export type PersistentPageMap = { [anchorId: string]: PersistentPage };
