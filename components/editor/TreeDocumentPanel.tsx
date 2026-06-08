"use client";

import { useContext, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { createDocumentTreeConfig } from "@src/lib/document-tree/document-tree-config";
import DocumentEditorPanel from "./DocumentEditorPanel";
import { FileText } from "lucide-react";

import styles from "./EditorPanel.module.css";

const EmptyDocumentState = () => {
    const t = useTranslations("editorSidebar");

    return (
        <div className={styles.editor_panel} style={{ alignItems: "center", justifyContent: "center" }}>
            <FileText size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ opacity: 0.5, fontSize: 13 }}>{t("documentsEmpty")}</p>
        </div>
    );
};

const TreeDocumentPanel = ({ isVisible }: { isVisible: boolean }) => {
    const { activeDocument, updateDocumentEditor } = useContext(ProjectContext);

    const config = useMemo(() => {
        if (!activeDocument || activeDocument.type !== "editor") return null;
        return createDocumentTreeConfig(activeDocument.docId);
    }, [activeDocument]);

    const handleEditorCreated = useCallback(
        (editor: import("@tiptap/react").Editor | null) => {
            updateDocumentEditor(editor);
        },
        [updateDocumentEditor],
    );

    if (!config || !activeDocument || activeDocument.type !== "editor") {
        return <EmptyDocumentState />;
    }

    return (
        <DocumentEditorPanel
            key={activeDocument.docId}
            config={config}
            isVisible={isVisible}
            onEditorCreated={handleEditorCreated}
            focusedTypeOverride="draft"
        />
    );
};

export default TreeDocumentPanel;
