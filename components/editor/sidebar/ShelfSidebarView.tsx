"use client";

import { useContext, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { getPageForPos } from "@src/lib/screenplay/extensions/pagination-extension";
import { Archive } from "lucide-react";
import ShelfSidebarItem from "./ShelfSidebarItem";
import { Editor } from "@tiptap/core";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";
import { join } from "@src/lib/utils/misc";

function computeNodePages(editor: Editor, nodeIds: string[]): Record<string, number> {
    if (nodeIds.length === 0) return {};
    const idSet = new Set(nodeIds);
    const result: Record<string, number> = {};
    let offset = 0;
    editor.state.doc.forEach((node) => {
        const id: string | undefined = node.attrs?.["data-id"];
        if (id && idSet.has(id)) result[id] = getPageForPos(editor, offset);
        offset += node.nodeSize;
    });
    return result;
}

const ShelfSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { shelfEntries, editor, repository } = useContext(ProjectContext);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [nodePages, setNodePages] = useState<Record<string, number>>({});

    const editorRef = useRef(editor);
    const shelfEntriesRef = useRef(shelfEntries);
    useEffect(() => { editorRef.current = editor; }, [editor]);
    useEffect(() => { shelfEntriesRef.current = shelfEntries; }, [shelfEntries]);

    useEffect(() => {
        if (!repository) return;
        const cb = () => {
            if (editorRef.current)
                setNodePages(computeNodePages(editorRef.current, Object.keys(shelfEntriesRef.current)));
        };
        repository.registerScreenplayCallback(cb);
        return () => repository.unregisterScreenplayCallback(cb);
    }, [repository]);

    const entries = Object.entries(shelfEntries);

    return (
        <>
            <div className={sidebar_nav.list_header}>
                <Archive size={18} />
                <p className={form.label}>{t("shelf")}</p>
            </div>
            <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                {entries.map(([nodeId, entry]) => (
                    <ShelfSidebarItem
                        key={nodeId}
                        nodeId={nodeId}
                        entry={entry}
                        isExpanded={expandedId === nodeId}
                        onToggle={() => setExpandedId(expandedId === nodeId ? null : nodeId)}
                        page={nodePages[nodeId]}
                    />
                ))}
            </div>
        </>
    );
};

export default ShelfSidebarView;
