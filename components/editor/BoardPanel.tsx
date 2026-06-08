"use client";

import { useContext } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import BoardCanvas from "@components/board/BoardCanvas";
import { LayoutDashboard } from "lucide-react";

import styles from "./EditorPanel.module.css";

const EmptyBoardState = () => {
    const t = useTranslations("editorSidebar");

    return (
        <div className={styles.editor_panel} style={{ alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ opacity: 0.5, fontSize: 13 }}>{t("documentsEmpty")}</p>
        </div>
    );
};

/**
 * Renders the board document currently selected in the document tree. The
 * "board" panel is doc-aware: it reads `activeDocument` and mounts a fresh
 * BoardCanvas (keyed by id) for the active board, or an empty state when the
 * active document isn't a board.
 */
const BoardPanel = ({ isVisible }: { isVisible: boolean }) => {
    const { activeDocument } = useContext(ProjectContext);

    if (!activeDocument || activeDocument.type !== "board") {
        return <EmptyBoardState />;
    }

    return <BoardCanvas key={activeDocument.docId} docId={activeDocument.docId} isVisible={isVisible} />;
};

export default BoardPanel;
