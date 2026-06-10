"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { DocumentNode } from "@src/lib/project/project-state";
import { DEFAULT_ITEM_COLORS } from "@src/lib/utils/colors";
import { join } from "@src/lib/utils/misc";
import { FilePlus, FolderPlus, FolderTree, LayoutDashboard, Pencil, Trash2 } from "lucide-react";
import DocumentTreeItem, { DropPosition } from "./DocumentTreeItem";
import { ContextMenuItem } from "./ContextMenu";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";
import context from "./ContextMenu.module.css";

type MenuState = { x: number; y: number; node: DocumentNode | null };

const DocumentTreeSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { documents, repository } = useContext(ProjectContext);
    const { setSideDocument, closeDocument, primaryDocId, secondaryDocId } = useViewContext();

    // Documents currently open in a panel — highlighted in the tree.
    const openDocIds = useMemo(
        () => new Set([primaryDocId, secondaryDocId].filter((id): id is string => !!id)),
        [primaryDocId, secondaryDocId],
    );

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null);

    // Right-click menu + inline edit state (lifted here so the menu can drive it).
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

    // Children of a parent (null = root), sorted by fractional `order`.
    const childrenOf = useCallback(
        (parentId: string | null): DocumentNode[] =>
            Object.values(documents)
                .filter((n) => (n.parentId ?? null) === (parentId ?? null))
                .sort((a, b) => a.order - b.order),
        [documents],
    );

    const roots = useMemo(() => childrenOf(null), [childrenOf]);

    const appendOrder = useCallback(
        (parentId: string | null, excludeId?: string) => {
            const kids = childrenOf(parentId).filter((n) => n.id !== excludeId);
            return kids.length ? kids[kids.length - 1].order + 1 : 0;
        },
        [childrenOf],
    );

    const toggle = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const openDocument = useCallback(
        (node: DocumentNode) => {
            if (node.type === "board") setSideDocument("secondary", node.id, "board");
            else if (node.type === "editor") setSideDocument("secondary", node.id, "document");
        },
        [setSideDocument],
    );

    const createInside = useCallback(
        (parentId: string | null, type: "folder" | "editor" | "board") => {
            if (!repository) return;
            if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
            let id: string;
            if (type === "folder") id = repository.createFolder(t("untitledFolder"), parentId);
            else if (type === "board") id = repository.createBoardDocument(t("boardTitle"), parentId);
            else id = repository.createEditorDocument(t("untitledDocument"), parentId);
            // Drop the new node straight into inline rename so the writer can name it instantly.
            if (id) setRenamingId(id);
        },
        [repository, t],
    );

    const deleteDocument = useCallback(
        (id: string) => {
            if (!repository) return;
            // Clear the open document if it (or a descendant) is being removed.
            const removed = new Set<string>();
            const stack = [id];
            while (stack.length) {
                const cur = stack.pop()!;
                removed.add(cur);
                for (const n of Object.values(documents)) if (n.parentId === cur) stack.push(n.id);
            }
            removed.forEach((rid) => closeDocument(rid));
            repository.deleteDocument(id);
            setConfirmingDeleteId(null);
        },
        [repository, documents, closeDocument],
    );

    const commitRename = useCallback(
        (id: string, title: string) => {
            if (title) repository?.renameDocument(id, title);
            setRenamingId(null);
        },
        [repository],
    );

    // Right-click color picker. Clicking the active color again clears it.
    const setColor = useCallback(
        (id: string, color: string) => {
            const current = documents[id]?.color;
            repository?.setDocumentColor(id, current === color ? undefined : color);
            setMenu(null);
        },
        [repository, documents],
    );

    // ---- Right-click menu ----
    const openMenu = useCallback((node: DocumentNode | null, e: React.MouseEvent) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, node });
    }, []);

    // Close the menu on any left-click, scroll, resize, or Escape.
    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenu(null);
        };
        window.addEventListener("click", close);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("click", close);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [menu]);

    // ---- Drag & drop ----
    const onDragStart = useCallback((id: string) => setDraggingId(id), []);

    const onDragOverNode = useCallback((id: string, pos: DropPosition) => {
        setDropTarget((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }));
    }, []);

    const resetDrag = useCallback(() => {
        setDraggingId(null);
        setDropTarget(null);
    }, []);

    const onDropNode = useCallback(
        (targetId: string) => {
            const dragId = draggingId;
            const target = documents[targetId];
            const pos = dropTarget?.pos;
            resetDrag();
            if (!repository || !dragId || !target || !pos || dragId === targetId) return;

            if (pos === "into") {
                repository.moveDocument(dragId, target.id, appendOrder(target.id, dragId));
                setExpanded((prev) => new Set(prev).add(target.id));
                return;
            }

            const parentId = target.parentId ?? null;
            const siblings = childrenOf(parentId).filter((n) => n.id !== dragId);
            const idx = siblings.findIndex((n) => n.id === targetId);
            let order: number;
            if (pos === "before") {
                const prev = siblings[idx - 1];
                order = prev ? (prev.order + target.order) / 2 : target.order - 1;
            } else {
                const next = siblings[idx + 1];
                order = next ? (target.order + next.order) / 2 : target.order + 1;
            }
            repository.moveDocument(dragId, parentId, order);
        },
        [draggingId, documents, dropTarget, repository, appendOrder, childrenOf, resetDrag],
    );

    const onDropRoot = useCallback(() => {
        const dragId = draggingId;
        resetDrag();
        if (!repository || !dragId) return;
        repository.moveDocument(dragId, null, appendOrder(null, dragId));
    }, [draggingId, repository, appendOrder, resetDrag]);

    const renderMenu = () => {
        if (!menu) return null;
        const node = menu.node;
        const left = Math.min(menu.x, window.innerWidth - 230);
        const top = Math.min(menu.y, window.innerHeight - 220);
        // Where create actions should put new nodes: inside a right-clicked
        // folder, otherwise at the root.
        const parentId = node?.type === "folder" ? node.id : null;
        const showCreate = !node || node.type === "folder";
        const showEdit = !!node;

        return (
            <div
                className={context.menu}
                style={{ top, left }}
                onContextMenu={(e) => e.preventDefault()}
            >
                {showCreate && (
                    <>
                        <ContextMenuItem
                            text={t("newDocument")}
                            icon={FilePlus}
                            action={() => createInside(parentId, "editor")}
                        />
                        <ContextMenuItem
                            text={t("newFolder")}
                            icon={FolderPlus}
                            action={() => createInside(parentId, "folder")}
                        />
                        <ContextMenuItem
                            text={t("newBoard")}
                            icon={LayoutDashboard}
                            action={() => createInside(parentId, "board")}
                        />
                    </>
                )}
                {showCreate && showEdit && <div className={context.menu_separator} />}
                {showEdit && node && (
                    <>
                        <div className={context.colors}>
                            {DEFAULT_ITEM_COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={join(
                                        context.color_swatch,
                                        node.color === color ? context.color_swatch_active : "",
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setColor(node.id, color)}
                                />
                            ))}
                        </div>
                        <ContextMenuItem
                            text={t("rename")}
                            icon={Pencil}
                            action={() => setRenamingId(node.id)}
                        />
                        <ContextMenuItem
                            text={t("delete")}
                            icon={Trash2}
                            action={() => setConfirmingDeleteId(node.id)}
                        />
                    </>
                )}
            </div>
        );
    };

    return (
        <>
            <div className={sidebar_nav.list_header}>
                <FolderTree size={18} />
                <p className={form.label}>{t("documents")}</p>
            </div>
            <div
                className={join(sidebar_nav.list, sidebar_nav.scene_list)}
                onContextMenu={(e) => openMenu(null, e)}
                onDragOver={(e) => {
                    if (!draggingId) return;
                    // Over empty list space (not a row): clear the row indicator;
                    // dropping here still moves the item to the root level.
                    e.preventDefault();
                    setDropTarget(null);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    onDropRoot();
                }}
            >
                {roots.length !== 0 ? (
                    roots.map((node) => (
                        <DocumentTreeItem
                            key={node.id}
                            node={node}
                            depth={0}
                            childrenOf={childrenOf}
                            expanded={expanded}
                            onToggle={toggle}
                            openDocIds={openDocIds}
                            onOpen={openDocument}
                            onContextMenu={openMenu}
                            renamingId={renamingId}
                            onRenameCommit={commitRename}
                            onRenameCancel={() => setRenamingId(null)}
                            confirmingDeleteId={confirmingDeleteId}
                            onConfirmDelete={deleteDocument}
                            onCancelDelete={() => setConfirmingDeleteId(null)}
                            draggingId={draggingId}
                            dropTarget={dropTarget}
                            onDragStart={onDragStart}
                            onDragOverNode={onDragOverNode}
                            onDropNode={onDropNode}
                            onDragEnd={resetDrag}
                        />
                    ))
                ) : (
                    <div className={sidebar_nav.empty_state}>{t("documentsEmpty")}</div>
                )}
            </div>
            {renderMenu()}
        </>
    );
};

export default DocumentTreeSidebarView;
