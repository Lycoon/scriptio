"use client";

import { useContext } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import OutlineView from "./OutlineView";
import { ListTree } from "lucide-react";

import styles from "../EditorPanel.module.css";

const EmptyOutlineState = () => {
    const t = useTranslations("outline");

    return (
        <div className={styles.editor_panel} style={{ alignItems: "center", justifyContent: "center" }}>
            <ListTree size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ opacity: 0.5, fontSize: 13, maxWidth: 280, textAlign: "center" }}>{t("empty")}</p>
        </div>
    );
};

/**
 * The Outline view: a project-wide, ordered, nestable list of blocks that
 * reference scene headings and board cards. Writers reorder/indent blocks to
 * sequence their story beats. Shows an empty state until something is sent here.
 */
const OutlinePanel = ({ isVisible }: { isVisible: boolean }) => {
    const { outline } = useContext(ProjectContext);

    if (Object.keys(outline).length === 0) {
        return <EmptyOutlineState />;
    }

    return <OutlineView isVisible={isVisible} />;
};

export default OutlinePanel;
