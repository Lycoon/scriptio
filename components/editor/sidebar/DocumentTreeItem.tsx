"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentNode, DocumentNodeType } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import {
    ChevronRight,
    FilePlus,
    FileText,
    Folder,
    FolderPlus,
    LayoutDashboard,
    Pencil,
    Trash2,
} from "lucide-react";

import styles from "./DocumentTreeItem.module.css";

const TYPE_ICONS: Record<DocumentNodeType, typeof FileText> = {
    folder: Folder,
    editor: FileText,
    board: LayoutDashboard,
};

export type DropPosition = "into" | "before" | "after";

export interface DocumentTreeItemProps {
    node: DocumentNode;
    depth: number;
    childrenOf: (parentId: string) => DocumentNode[];
    expanded: Set<string>;
    onToggle: (id: string) => void;
    activeDocId: string | null;
    onOpen: (node: DocumentNode) => void;
    onCreateChild: (parentId: string, type: "folder" | "editor") => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
    // Drag & drop
    draggingId: string | null;
    dropTarget: { id: string; pos: DropPosition } | null;
    onDragStart: (id: string) => void;
    onDragOverNode: (id: string, pos: DropPosition) => void;
    onDropNode: (id: string) => void;
    onDragEnd: () => void;
}

const INDENT = 14;

const DocumentTreeItem = ({
    node,
    depth,
    childrenOf,
    expanded,
    onToggle,
    activeDocId,
    onOpen,
    onCreateChild,
    onRename,
    onDelete,
    draggingId,
    dropTarget,
    onDragStart,
    onDragOverNode,
    onDropNode,
    onDragEnd,
}: DocumentTreeItemProps) => {
    const t = useTranslations("editorSidebar");
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const Icon = TYPE_ICONS[node.type];
    const isFolder = node.type === "folder";
    const isOpen = expanded.has(node.id);
    const isActive = node.type === "editor" && activeDocId === node.id;
    const busy = isRenaming || confirmingDelete;

    const handleRowClick = useCallback(() => {
        if (busy) return;
        if (isFolder) onToggle(node.id);
        else onOpen(node);
    }, [busy, isFolder, node, onToggle, onOpen]);

    const startRename = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            setRenameValue(node.title);
            setIsRenaming(true);
            setTimeout(() => renameInputRef.current?.select(), 0);
        },
        [node.title],
    );

    const commitRename = useCallback(() => {
        const trimmed = renameValue.trim();
        if (trimmed) onRename(node.id, trimmed);
        setIsRenaming(false);
    }, [renameValue, node.id, onRename]);

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!draggingId || draggingId === node.id) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            let pos: DropPosition;
            if (isFolder) {
                if (y < rect.height * 0.25) pos = "before";
                else if (y > rect.height * 0.75) pos = "after";
                else pos = "into";
            } else {
                pos = y < rect.height / 2 ? "before" : "after";
            }
            onDragOverNode(node.id, pos);
        },
        [draggingId, node.id, isFolder, onDragOverNode],
    );

    const isDropTarget = dropTarget?.id === node.id;
    const rowClass = join(
        styles.row,
        isActive ? styles.row_active : "",
        isDropTarget && dropTarget?.pos === "into" ? styles.row_drop_into : "",
        isDropTarget && dropTarget?.pos === "before" ? styles.row_drop_before : "",
        isDropTarget && dropTarget?.pos === "after" ? styles.row_drop_after : "",
    );

    return (
        <>
            <div
                className={rowClass}
                style={{ paddingLeft: 12 + depth * INDENT, opacity: draggingId === node.id ? 0.4 : 1 }}
                onClick={handleRowClick}
                draggable={!busy}
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onDragStart(node.id);
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDropNode(node.id);
                }}
                onDragEnd={onDragEnd}
            >
                {isFolder ? (
                    <ChevronRight
                        size={13}
                        className={join(styles.chevron, isOpen ? styles.chevron_expanded : "")}
                    />
                ) : (
                    <span className={styles.chevron_placeholder} />
                )}
                <Icon size={14} className={styles.type_icon} />

                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        className={styles.rename_input}
                        value={renameValue}
                        draggable={false}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            else if (e.key === "Escape") setIsRenaming(false);
                        }}
                    />
                ) : confirmingDelete ? (
                    <div className={styles.confirm_row} onClick={(e) => e.stopPropagation()}>
                        <span className={styles.confirm_text}>
                            {isFolder ? t("confirmDeleteFolder") : t("confirmDelete")}
                        </span>
                        <div className={styles.confirm_btns}>
                            <button
                                className={styles.confirm_yes}
                                onClick={() => {
                                    setConfirmingDelete(false);
                                    onDelete(node.id);
                                }}
                            >
                                {t("delete")}
                            </button>
                            <button className={styles.confirm_no} onClick={() => setConfirmingDelete(false)}>
                                {t("cancel")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <span className={join(styles.title, "unselectable")}>{node.title}</span>
                        <div className={styles.actions}>
                            {isFolder && (
                                <>
                                    <button
                                        className={styles.action_btn}
                                        title={t("newDocument")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isOpen) onToggle(node.id);
                                            onCreateChild(node.id, "editor");
                                        }}
                                    >
                                        <FilePlus size={12} />
                                    </button>
                                    <button
                                        className={styles.action_btn}
                                        title={t("newFolder")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isOpen) onToggle(node.id);
                                            onCreateChild(node.id, "folder");
                                        }}
                                    >
                                        <FolderPlus size={12} />
                                    </button>
                                </>
                            )}
                            <button className={styles.action_btn} title={t("rename")} onClick={startRename}>
                                <Pencil size={12} />
                            </button>
                            <button
                                className={join(styles.action_btn, styles.action_btn_danger)}
                                title={t("delete")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingDelete(true);
                                }}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {isFolder &&
                isOpen &&
                childrenOf(node.id).map((child) => (
                    <DocumentTreeItem
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        childrenOf={childrenOf}
                        expanded={expanded}
                        onToggle={onToggle}
                        activeDocId={activeDocId}
                        onOpen={onOpen}
                        onCreateChild={onCreateChild}
                        onRename={onRename}
                        onDelete={onDelete}
                        draggingId={draggingId}
                        dropTarget={dropTarget}
                        onDragStart={onDragStart}
                        onDragOverNode={onDragOverNode}
                        onDropNode={onDropNode}
                        onDragEnd={onDragEnd}
                    />
                ))}
        </>
    );
};

export default DocumentTreeItem;
