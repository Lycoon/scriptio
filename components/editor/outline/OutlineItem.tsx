"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { OutlineItem as OutlineItemType } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import { Film, Unlink, X } from "lucide-react";
import type { ResolvedOutline } from "./OutlineView";

import styles from "./OutlineItem.module.css";

export type DropPosition = "into" | "before" | "after";

export interface OutlineItemProps {
    node: OutlineItemType;
    depth: number;
    childrenOf: (parentId: string | null) => OutlineItemType[];
    resolved: Record<string, ResolvedOutline>;
    onNavigate: (node: OutlineItemType) => void;
    onRemove: (id: string) => void;
    // Drag & drop
    draggingId: string | null;
    dropTarget: { id: string; pos: DropPosition } | null;
    onDragStart: (id: string) => void;
    onDragOverNode: (id: string, pos: DropPosition) => void;
    onDropNode: (id: string) => void;
    onDragEnd: () => void;
}

const INDENT = 36;

const OutlineItem = ({
    node,
    depth,
    childrenOf,
    resolved,
    onNavigate,
    onRemove,
    draggingId,
    dropTarget,
    onDragStart,
    onDragOverNode,
    onDropNode,
    onDragEnd,
}: OutlineItemProps) => {
    const t = useTranslations("outline");

    const r = resolved[node.id] ?? { title: node.title, preview: node.preview, color: node.color, missing: true };
    const isCard = node.source === "card";
    const children = childrenOf(node.id);

    // Every block can nest children, so use folder-style drop thresholds:
    // top 25% = before, middle 50% = into, bottom 25% = after.
    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!draggingId || draggingId === node.id) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            let pos: DropPosition;
            if (y < rect.height * 0.25) pos = "before";
            else if (y > rect.height * 0.75) pos = "after";
            else pos = "into";
            onDragOverNode(node.id, pos);
        },
        [draggingId, node.id, onDragOverNode],
    );

    const isDropTarget = dropTarget?.id === node.id;
    const blockClass = join(
        styles.block,
        r.missing ? styles.block_missing : "",
        isDropTarget && dropTarget?.pos === "into" ? styles.block_drop_into : "",
        isDropTarget && dropTarget?.pos === "before" ? styles.block_drop_before : "",
        isDropTarget && dropTarget?.pos === "after" ? styles.block_drop_after : "",
    );

    return (
        <>
            <div style={{ paddingLeft: depth * INDENT }}>
                <div
                    className={blockClass}
                    style={{
                        opacity: draggingId === node.id ? 0.4 : 1,
                        ...(r.color ? { "--card-color": r.color } : {}),
                    } as React.CSSProperties}
                    onClick={() => onNavigate(node)}
                    draggable
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
                    <div className={styles.color_strip} />
                    <div className={styles.body}>
                        <div className={styles.title_row}>
                            {!isCard && <Film size={14} className={styles.type_icon} />}
                            <span className={join(styles.title, "unselectable")}>{r.title || t("untitled")}</span>
                            {r.missing && (
                                <span className={styles.unlinked} title={t("unlinkedHint")}>
                                    <Unlink size={11} />
                                    {t("unlinked")}
                                </span>
                            )}
                            <button
                                className={styles.remove_btn}
                                title={t("removeFromOutline")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(node.id);
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        {r.preview && <p className={join(styles.preview, "unselectable")}>{r.preview}</p>}
                    </div>
                </div>
            </div>

            {children.map((child) => (
                <OutlineItem
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    childrenOf={childrenOf}
                    resolved={resolved}
                    onNavigate={onNavigate}
                    onRemove={onRemove}
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

export default OutlineItem;
