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

const TreeDocumentPanel = ({ isVisible, docId }: { isVisible: boolean; docId: string | null }) => {
    const { updateDocumentEditor } = useContext(ProjectContext);

    const config = useMemo(() => (docId ? createDocumentTreeConfig(docId) : null), [docId]);

    const handleEditorCreated = useCallback(
        (editor: import("@tiptap/react").Editor | null) => {
            updateDocumentEditor(editor);
        },
        [updateDocumentEditor],
    );

    if (!config || !docId) {
        return <EmptyDocumentState />;
    }

    return (
        <DocumentEditorPanel
            key={docId}
            config={config}
            isVisible={isVisible}
            onEditorCreated={handleEditorCreated}
            focusedTypeOverride="draft"
        />
    );
};

export default TreeDocumentPanel;
