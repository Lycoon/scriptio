import type { EditorView } from "@tiptap/pm/view";

/**
 * Shared deferred structural refresh utility.
 *
 * When multiple ProseMirror plugins need to recompute decorations after a structural
 * document change (Enter, Delete, paste), this utility coalesces their refresh requests
 * into a single transaction dispatched on the next animation frame.
 *
 * Usage in a plugin:
 * - In apply(): on structural change, set a flag and return oldDecorations.map(tr.mapping, newState.doc)
 * - In view().update(): if flag is set, call scheduleStructuralRefresh(view)
 * - In apply(): on STRUCTURAL_REFRESH_META, do the full recomputation
 */

export const STRUCTURAL_REFRESH_META = "structuralDecorationsRefresh";

let pendingRefresh: number | null = null;

/**
 * Schedule a single deferred structural refresh for the next animation frame.
 * Multiple calls in the same frame are coalesced into one dispatch.
 * All plugins that check STRUCTURAL_REFRESH_META will recompute on this dispatch.
 */
export function scheduleStructuralRefresh(view: EditorView) {
    if (pendingRefresh !== null) return;
    pendingRefresh = requestAnimationFrame(() => {
        pendingRefresh = null;
        if (!(view as EditorView & { isDestroyed?: boolean }).isDestroyed) {
            view.dispatch(view.state.tr.setMeta(STRUCTURAL_REFRESH_META, true));
        }
    });
}

/**
 * Cancel any pending structural refresh. Call this on plugin destroy.
 */
export function cancelStructuralRefresh() {
    if (pendingRefresh !== null) {
        cancelAnimationFrame(pendingRefresh);
        pendingRefresh = null;
    }
}
