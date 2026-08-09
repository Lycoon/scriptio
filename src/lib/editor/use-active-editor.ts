"use client";

import { useContext } from "react";
import type { Editor } from "@tiptap/react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";

/**
 * The text editor backing the panel currently being worked in, or null for panels
 * that have no editor (board, statistics). Used by the chrome that acts on
 * whatever the reader is looking at: the phone pen button, and the navbar
 * undo/redo pair that phones and tablets both carry.
 *
 * Resolved from `focusedPanel` rather than `primaryPanel` so a split view answers
 * with the side being written in — a tablet gets the desktop layout, split
 * included, and undo landing on the other panel's document would be a silent way
 * to lose work. Off a split the two are the same value (see ViewContext), so the
 * phone, which never splits, is unaffected.
 */
export const useActiveEditor = (): Editor | null => {
    const { editor, titlePageEditor, draftEditor, documentEditor } = useContext(ProjectContext);
    const { focusedPanel } = useViewContext();

    switch (focusedPanel) {
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
