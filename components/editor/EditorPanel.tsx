"use client";

import { useContext, useMemo } from "react";
import { UserContext } from "@src/context/UserContext";
import { ProjectContext } from "@src/context/ProjectContext";

import { SCREENPLAY_EDITOR_CONFIG } from "@src/lib/editor/document-editor-config";
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
    const { updateEditor } = useContext(ProjectContext);

    const globalActions = useMemo(
        () => ({
            toggleFocusMode: () => updateIsZenMode((prev: boolean) => !prev),
            saveProject: () => console.log("Project Saved"),
        }),
        [updateIsZenMode],
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
