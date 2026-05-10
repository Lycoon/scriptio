"use client";

import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { Archive } from "lucide-react";
import ShelfSidebarItem from "./ShelfSidebarItem";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";
import { join } from "@src/lib/utils/misc";

const ShelfSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { shelfEntries } = useContext(ProjectContext);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const entries = Object.entries(shelfEntries);

    return (
        <>
            <div className={sidebar_nav.list_header}>
                <Archive size={18} />
                <p className={form.label}>{t("shelf")}</p>
            </div>
            <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                {entries.length !== 0 ? (
                    entries.map(([nodeId, entry]) => (
                        <ShelfSidebarItem
                            key={nodeId}
                            nodeId={nodeId}
                            entry={entry}
                            isExpanded={expandedId === nodeId}
                            onToggle={() => setExpandedId(expandedId === nodeId ? null : nodeId)}
                        />
                    ))
                ) : (
                    <div className={sidebar_nav.empty_state}>
                        {t("shelfEmpty")}
                    </div>
                )}
            </div>
        </>
    );
};

export default ShelfSidebarView;
