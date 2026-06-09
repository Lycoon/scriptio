"use client";

import { useTranslations } from "next-intl";
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
 * Renders the board bound to this panel side (`docId`). Each side carries its
 * own docId, so two boards can be open at once. A fresh BoardCanvas is mounted
 * per docId; an empty state shows when the side has no document.
 */
const BoardPanel = ({ isVisible, docId }: { isVisible: boolean; docId: string | null }) => {
    if (!docId) {
        return <EmptyBoardState />;
    }

    return <BoardCanvas key={docId} docId={docId} isVisible={isVisible} />;
};

export default BoardPanel;
