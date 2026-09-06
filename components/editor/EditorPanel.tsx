"use client";

import { useCallback, useContext, useMemo } from "react";
import { UserContext } from "@src/context/UserContext";
import { ProjectContext } from "@src/context/ProjectContext";

import { SCREENPLAY_EDITOR_CONFIG } from "@src/lib/editor/document-editor-config";
import { useFileActions } from "@src/lib/persistence/use-file-binding";
import DocumentEditorPanel from "./DocumentEditorPanel";
import type { SuggestionData } from "./SuggestionMenu";

interface EditorPanelProps {
    isVisible: boolean;
    suggestions: string[];
    updateSuggestions: (suggestions: string[]) => void;
    suggestionData: SuggestionData;
    updateSuggestionData: (data: SuggestionData) => void;
}

const EditorPanel = ({ isVisible, suggestions, updateSuggestions, suggestionData, updateSuggestionData }: EditorPanelProps) => {
    const { updateIsZenMode } = useContext(UserContext);
    const { updateEditor, projectId, projectTitle, repository } = useContext(ProjectContext);
    const fileActions = useFileActions(projectId, projectTitle);

    /**
     * ⌘S means "save to a file", and nothing else.
     *
     * Everything else is already saved — continuously, to this device and to the
     * cloud — so there is no version of this shortcut that makes the project
     * safer. What it can do is give the user a copy they own: on desktop that is
     * a binding Scriptio then keeps current (or, unbound, the offer to make one),
     * and where no binding is possible it is a plain export of a copy, the same
     * thing the Export panel writes.
     */
    const saveProject = useCallback(async () => {
        if (fileActions.isSupported) {
            await fileActions.save();
            return;
        }

        const ydoc = repository?.getState();
        if (!ydoc) return;
        const { ScriptioAdapter } = await import("@src/lib/adapters/scriptio/scriptio-adapter");
        await new ScriptioAdapter().export(ydoc, {
            title: projectTitle || "Untitled",
            author: ydoc.metadata().get("author") ?? "",
            includeNotes: true,
            readable: false,
            projectId,
        });
    }, [fileActions, repository, projectTitle, projectId]);

    const globalActions = useMemo(
        () => ({
            toggleFocusMode: () => updateIsZenMode((prev: boolean) => !prev),
            saveProject: () => void saveProject(),
        }),
        [updateIsZenMode, saveProject],
    );

    return (
        <DocumentEditorPanel
            config={SCREENPLAY_EDITOR_CONFIG}
            isVisible={isVisible}
            onEditorCreated={updateEditor}
            suggestions={suggestions}
            updateSuggestions={updateSuggestions}
            suggestionData={suggestionData}
            updateSuggestionData={updateSuggestionData}
            globalContext={globalActions}
        />
    );
};

export default EditorPanel;
