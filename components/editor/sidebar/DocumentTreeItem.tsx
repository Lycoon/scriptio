"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { DocumentNode, DocumentNodeType } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import { ChevronRight, FileText, Folder, LayoutDashboard } from "lucide-react";

import styles from "./DocumentTreeItem.module.css";

const TYPE_ICONS: Record<DocumentNodeType, typeof FileText> = {
    folder: Folder,
    editor: FileText,
    board: LayoutDashboard,
};

export type DropPosition = "into" | "before" | "after";

/**
 * dataTransfer MIME used when dragging an `editor`/`board` document out of the
 * tree onto a panel to open it there. Reordering within the tree uses internal
 * React state, so this only matters for cross-target (panel) drops.
 */
export const DOC_DND_MIME = "application/x-scriptio-doc";

export interface DocumentTreeItemProps {
    node: DocumentNode;
    depth: number;
    childrenOf: (parentId: string) => DocumentNode[];
    expanded: Set<string>;
    onToggle: (id: string) => void;
    openDocIds: Set<string>;
    onOpen: (node: DocumentNode) => void;
    onContextMenu: (node: DocumentNode, e: React.MouseEvent) => void;
    // Inline rename (state lifted to the view so the context menu can trigger it).
    renamingId: string | null;
    onRenameCommit: (id: string, title: string) => void;
    onRenameCancel: () => void;
    // Inline delete confirmation (state lifted to the view).
    confirmingDeleteId: string | null;
    onConfirmDelete: (id: string) => void;
    onCancelDelete: () => void;
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
    openDocIds,
    onOpen,
    onContextMenu,
    renamingId,
    onRenameCommit,
    onRenameCancel,
    confirmingDeleteId,
    onConfirmDelete,
    onCancelDelete,
    draggingId,
    dropTarget,
    onDragStart,
    onDragOverNode,
    onDropNode,
    onDragEnd,
}: DocumentTreeItemProps) => {
    const t = useTranslations("editorSidebar");
    const renameInputRef = useRef<HTMLInputElement>(null);

    const Icon = TYPE_ICONS[node.type];
    const isFolder = node.type === "folder";
    const isOpen = expanded.has(node.id);
    const isActive = openDocIds.has(node.id);
    const isRenaming = renamingId === node.id;
    const confirmingDelete = confirmingDeleteId === node.id;
    const busy = isRenaming || confirmingDelete;

    const handleRowClick = useCallback(() => {
        if (busy) return;
        if (isFolder) onToggle(node.id);
        else onOpen(node);
    }, [busy, isFolder, node, onToggle, onOpen]);

    const commitRename = useCallback(() => {
        onRenameCommit(node.id, (renameInputRef.current?.value ?? "").trim());
    }, [node.id, onRenameCommit]);

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
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(node, e);
                }}
                draggable={!busy}
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    // Openable documents carry their id/type so they can be
                    // dropped onto a panel to open there (folders cannot).
                    if (node.type === "editor" || node.type === "board") {
                        e.dataTransfer.setData(DOC_DND_MIME, JSON.stringify({ id: node.id, type: node.type }));
                    }
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
                {node.color && <span className={styles.color_bar} style={{ backgroundColor: node.color }} />}
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
                        defaultValue={node.title}
                        draggable={false}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={commitRename}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            else if (e.key === "Escape") onRenameCancel();
                        }}
                    />
                ) : confirmingDelete ? (
                    <div className={styles.confirm_row} onClick={(e) => e.stopPropagation()}>
                        <span className={styles.confirm_text}>
                            {isFolder ? t("confirmDeleteFolder") : t("confirmDelete")}
                        </span>
                        <div className={styles.confirm_btns}>
                            <button className={styles.confirm_yes} onClick={() => onConfirmDelete(node.id)}>
                                {t("delete")}
                            </button>
                            <button className={styles.confirm_no} onClick={onCancelDelete}>
                                {t("cancel")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <span className={join(styles.title, "unselectable")}>{node.title}</span>
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
                        openDocIds={openDocIds}
                        onOpen={onOpen}
                        onContextMenu={onContextMenu}
                        renamingId={renamingId}
                        onRenameCommit={onRenameCommit}
                        onRenameCancel={onRenameCancel}
                        confirmingDeleteId={confirmingDeleteId}
                        onConfirmDelete={onConfirmDelete}
                        onCancelDelete={onCancelDelete}
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
