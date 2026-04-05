"use client";

import { useContext, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { createShelfEditorConfig } from "@src/lib/shelf/shelf-editor-config";
import DocumentEditorPanel from "./DocumentEditorPanel";
import { Archive } from "lucide-react";

import styles from "./EditorPanel.module.css";

const EmptyShelfState = () => {
    const t = useTranslations("editorSidebar");

    return (
        <div className={styles.editor_panel} style={{ alignItems: "center", justifyContent: "center" }}>
            <Archive size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ opacity: 0.5, fontSize: 13 }}>{t("shelfEmpty")}</p>
        </div>
    );
};

const DraftEditorPanel = ({ isVisible }: { isVisible: boolean }) => {
    const { activeShelfVersion, updateDraftEditor } = useContext(ProjectContext);

    const config = useMemo(() => {
        if (!activeShelfVersion) return null;
        return createShelfEditorConfig(activeShelfVersion.nodeId, activeShelfVersion.versionId);
    }, [activeShelfVersion?.nodeId, activeShelfVersion?.versionId]);

    const handleEditorCreated = useCallback(
        (editor: import("@tiptap/react").Editor | null) => {
            updateDraftEditor(editor);
        },
        [updateDraftEditor],
    );

    if (!config || !activeShelfVersion) {
        return <EmptyShelfState />;
    }

    return (
        <DocumentEditorPanel
            key={`${activeShelfVersion.nodeId}_${activeShelfVersion.versionId}`}
            config={config}
            isVisible={isVisible}
            onEditorCreated={handleEditorCreated}
            focusedTypeOverride="draft"
        />
    );
};

export default DraftEditorPanel;
