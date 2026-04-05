"use client";

import { memo, useCallback, useContext, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { ShelfEntry, ShelfEntryType } from "@src/lib/project/project-state";
import { Clapperboard, CornerUpLeft, Pencil, Trash2, UserRound, Zap } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import styles from "./ShelfSidebarItem.module.css";

const TYPE_ICONS: Record<ShelfEntryType, typeof Clapperboard> = {
    scene: Clapperboard,
    character: UserRound,
    action: Zap,
};

interface ShelfSidebarItemProps {
    nodeId: string;
    entry: ShelfEntry;
    isExpanded: boolean;
    onToggle: () => void;
    page?: number;
}

const ShelfSidebarItem = memo(({ nodeId, entry, isExpanded, onToggle, page }: ShelfSidebarItemProps) => {
    const t = useTranslations("editorSidebar");
    const { activeShelfVersion, setActiveShelfVersion, repository, editor } = useContext(ProjectContext);
    const { setSecondaryPanel } = useViewContext();
    const [renamingVersionId, setRenamingVersionId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmRestoreVersionId, setConfirmRestoreVersionId] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const Icon = TYPE_ICONS[entry.type];

    const handleVersionClick = useCallback(
        (versionId: string) => {
            setActiveShelfVersion({ nodeId, versionId });
            setSecondaryPanel("draft");
        },
        [nodeId, setActiveShelfVersion, setSecondaryPanel],
    );

    const handleDelete = useCallback(
        (e: React.MouseEvent, versionId: string) => {
            e.stopPropagation();
            repository?.deleteShelfVersion(nodeId, versionId);
            if (activeShelfVersion?.nodeId === nodeId && activeShelfVersion?.versionId === versionId) {
                setActiveShelfVersion(null);
            }
        },
        [nodeId, repository, activeShelfVersion, setActiveShelfVersion],
    );

    const handleRestore = useCallback(
        (e: React.MouseEvent, versionId: string) => {
            e.stopPropagation();
            if (!repository || !editor) return;
            const content = repository.getShelfVersionContent(nodeId, versionId);
            if (!content || content.length === 0) return;

            // Find the original node by data-id and determine replacement range
            const doc = editor.state.doc;
            const children: Array<{ node: ReturnType<typeof doc.child>; pos: number }> = [];
            doc.forEach((node, pos) => children.push({ node, pos }));

            const startIdx = children.findIndex(({ node }) => node.attrs?.["data-id"] === nodeId);
            if (startIdx === -1) return;

            const startPos = children[startIdx].pos;
            let endPos: number;

            if (entry.type === "action") {
                endPos = startPos + children[startIdx].node.nodeSize;
            } else if (entry.type === "character") {
                let i = startIdx + 1;
                while (i < children.length) {
                    const cls = children[i].node.attrs?.class;
                    if (cls === "character" || cls === "dialogue" || cls === "parenthetical") {
                        i++;
                    } else {
                        break;
                    }
                }
                endPos = i < children.length ? children[i].pos : doc.content.size;
            } else {
                // scene: from heading to next scene heading
                let i = startIdx + 1;
                while (i < children.length && children[i].node.attrs?.class !== "scene") {
                    i++;
                }
                endPos = i < children.length ? children[i].pos : doc.content.size;
            }

            editor.chain().focus().insertContentAt({ from: startPos, to: endPos }, content).run();
        },
        [nodeId, entry.type, repository, editor],
    );

    const handleRenameStart = useCallback(
        (e: React.MouseEvent, versionId: string, currentTitle: string) => {
            e.stopPropagation();
            setRenamingVersionId(versionId);
            setRenameValue(currentTitle);
            // Focus the input on next tick
            setTimeout(() => renameInputRef.current?.focus(), 0);
        },
        [],
    );

    const handleRenameCommit = useCallback(() => {
        if (!renamingVersionId || !repository) return;
        const trimmed = renameValue.trim();
        if (trimmed) {
            repository.renameShelfVersion(nodeId, renamingVersionId, trimmed);
        }
        setRenamingVersionId(null);
    }, [renamingVersionId, renameValue, nodeId, repository]);

    const handleRenameKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") handleRenameCommit();
            else if (e.key === "Escape") setRenamingVersionId(null);
        },
        [handleRenameCommit],
    );

    return (
        <div className={styles.container}>
            <div className={join(styles.header, isExpanded ? styles.header_active : "")} onClick={onToggle}>
                <Icon size={14} className={styles.type_icon} />
                <span className={join(styles.title, "unselectable")}>{entry.title}</span>
                {page !== undefined && (
                    <span className={join(styles.version_count, "unselectable")}>p.{page}</span>
                )}
                <span className={join(styles.version_count, "unselectable")}>{entry.versions.length}</span>
            </div>
            {isExpanded && (
                <div className={styles.versions_list}>
                    {entry.versions.map((version) => {
                        const isActive =
                            activeShelfVersion?.nodeId === nodeId && activeShelfVersion?.versionId === version.id;
                        const isRenaming = renamingVersionId === version.id;
                        const isConfirmingRestore = confirmRestoreVersionId === version.id;

                        return (
                            <div
                                key={version.id}
                                className={join(styles.version_item, isActive ? styles.version_item_active : "")}
                                onClick={() => !isRenaming && !isConfirmingRestore && handleVersionClick(version.id)}
                            >
                                {isRenaming ? (
                                    <input
                                        ref={renameInputRef}
                                        className={styles.version_rename_input}
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={handleRenameCommit}
                                        onKeyDown={handleRenameKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : isConfirmingRestore ? (
                                    <div
                                        className={styles.confirm_row}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <span className={styles.confirm_text}>{t("confirmRestore")}</span>
                                        <div className={styles.confirm_btns}>
                                            <button
                                                className={styles.confirm_yes}
                                                onClick={(e) => {
                                                    setConfirmRestoreVersionId(null);
                                                    handleRestore(e, version.id);
                                                }}
                                            >
                                                {t("restore")}
                                            </button>
                                            <button
                                                className={styles.confirm_no}
                                                onClick={() => setConfirmRestoreVersionId(null)}
                                            >
                                                {t("cancel")}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <span className={join(styles.version_title, "unselectable")}>{version.title}</span>
                                        <div className={styles.version_actions}>
                                            <button
                                                className={styles.action_btn}
                                                title="Rename"
                                                onClick={(e) => handleRenameStart(e, version.id, version.title)}
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                className={styles.action_btn}
                                                title="Restore to screenplay"
                                                onClick={(e) => { e.stopPropagation(); setConfirmRestoreVersionId(version.id); }}
                                            >
                                                <CornerUpLeft size={12} />
                                            </button>
                                            <button
                                                className={join(styles.action_btn, styles.action_btn_danger)}
                                                title="Delete version"
                                                onClick={(e) => handleDelete(e, version.id)}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

ShelfSidebarItem.displayName = "ShelfSidebarItem";

export default ShelfSidebarItem;
