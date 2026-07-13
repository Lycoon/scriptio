"use client";

import { useContext } from "react";
import type { Editor } from "@tiptap/react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";

/**
 * The text editor backing the currently-shown primary panel, or null for panels
 * that have no editor (board, statistics). Used by phone-only chrome (the pen
 * button and the navbar undo/redo controls) which act on whatever the reader is
 * looking at. Phone is effectively single-panel, so resolving from
 * `primaryPanel` is sufficient; split view is a desktop-only affordance.
 */
export const useActiveEditor = (): Editor | null => {
    const { editor, titlePageEditor, draftEditor, documentEditor } = useContext(ProjectContext);
    const { primaryPanel } = useViewContext();

    switch (primaryPanel) {
        case "title":
            return titlePageEditor;
        case "draft":
            return draftEditor;
        case "document":
            return documentEditor;
        case "screenplay":
            return editor;
        default:
            return null;
    }
};
