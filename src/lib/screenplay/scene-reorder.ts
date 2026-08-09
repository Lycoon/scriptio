"use client";

import type { Editor } from "@tiptap/react";
import { Scene } from "./scenes";

/**
 * Move a scene to another slot in the screenplay document.
 *
 * `targetIndex` is a *gap* index rather than an item index: gap i means "insert
 * before scene i", and `scenes.length` means "after the last scene". Both
 * reorder surfaces — the navigation sidebar and the index-card grid — resolve a
 * drop to a gap, so "bottom of scene N" and "top of scene N+1" land on the same
 * value and the drop indicator can't flicker at a separator.
 *
 * The move is one transaction: cut the scene's slice out of the document, then
 * insert it at the gap (shifted by the cut length when the gap sits after the
 * scene's old home, since deleting moved everything downstream up).
 *
 * Returns the reordered scene array — the caller pushes it into ProjectContext
 * so the sidebar and cards update on the spot, ahead of the debounced
 * screenplay observer re-parsing with accurate positions — or null when the
 * drop is a no-op and nothing was dispatched.
 */
export const moveScene = (
    editor: Editor,
    scenes: Scene[],
    dragIndex: number,
    targetIndex: number,
): Scene[] | null => {
    // Either gap bordering the dragged scene leaves it exactly where it is.
    if (targetIndex === dragIndex || targetIndex === dragIndex + 1) return null;

    const dragScene = scenes[dragIndex];
    if (!dragScene) return null;

    const from = dragScene.position - 1;
    const to = dragScene.nextPosition - 1;
    const slice = editor.state.doc.slice(from, to);

    const tr = editor.state.tr;
    tr.delete(from, to);

    let insertPos: number;
    if (targetIndex <= dragIndex) {
        insertPos = scenes[targetIndex].position - 1;
    } else {
        // targetIndex can be scenes.length (drop after the last scene)
        const refPos =
            targetIndex < scenes.length ? scenes[targetIndex].position - 1 : editor.state.doc.content.size;
        insertPos = refPos - (to - from);
    }

    tr.insert(insertPos, slice.content);
    editor.view.dispatch(tr);

    const reordered = [...scenes];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex > dragIndex ? targetIndex - 1 : targetIndex, 0, moved);
    return reordered;
};
