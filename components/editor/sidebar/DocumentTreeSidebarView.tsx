"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import { useIsPhone } from "@src/lib/utils/hooks";
import { DocumentNode } from "@src/lib/project/project-state";
import { DEFAULT_ITEM_COLORS } from "@src/lib/utils/colors";
import { join } from "@src/lib/utils/misc";
import { FilePlus, FolderPlus, FolderTree, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import DocumentTreeItem, { DropPosition } from "./DocumentTreeItem";
import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuColorRow,
} from "@components/utils/ContextMenu";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

// Touch equivalent of the right-click: hold roughly still for this long to open
// the tree menu. A move farther than the cancel threshold before it fires is a
// scroll, and abandons the pending menu.
const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_PX = 10;

/**
 * Eat the click the browser synthesises when a finger lifts. Without this the
 * release of a long-press would immediately close the menu it just opened (the
 * context-menu host closes on any window click) and, on a row, also run the
 * row's open/toggle handler.
 */
const swallowNextClick = () => {
    const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    // Some engines consume the touch and never synthesise a click — drop the
    // one-shot listener shortly after so it can't eat a later, unrelated tap.
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
};

const DocumentTreeSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { documents, repository } = useContext(ProjectContext);
    const { contextMenu, updateContextMenu } = useContext(UserContext);
    const { setSideDocument, closeDocument, primaryDocId, secondaryDocId, setLeftSidebarOpen } =
        useViewContext();
    const isPhone = useIsPhone();

    // Documents currently open in a panel — highlighted in the tree.
    const openDocIds = useMemo(
        () => new Set([primaryDocId, secondaryDocId].filter((id): id is string => !!id)),
        [primaryDocId, secondaryDocId],
    );

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null);

    // Inline edit state (lifted here so the right-click menu can drive it).
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
            // On phone only the primary side is ever rendered, so open documents
            // there (the secondary side would be invisible, leaving no way to edit
            // a freshly-created board/document); larger screens use the split side.
            const side = isPhone ? "primary" : "secondary";
            if (node.type === "board") setSideDocument(side, node.id, "board");
            else if (node.type === "editor") setSideDocument(side, node.id, "document");
            else return;
            // Close the tree drawer so the opened document is actually visible.
            if (isPhone) setLeftSidebarOpen(false);
        },
        [setSideDocument, isPhone, setLeftSidebarOpen],
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
        },
        [repository, documents],
    );

    // ---- Context menu ----
    // Opens the shared single context-menu host with this node's actions at the
    // given viewport point (`node` null = the root, i.e. empty list space).
    const openMenuAt = useCallback(
        (node: DocumentNode | null, x: number, y: number) => {
            const left = Math.min(x, window.innerWidth - 230);
            const top = Math.min(y, window.innerHeight - 220);
            // Where create actions should put new nodes: inside a right-clicked
            // folder, otherwise at the root.
            const parentId = node?.type === "folder" ? node.id : null;
            const showCreate = !node || node.type === "folder";
            const showEdit = !!node;
            updateContextMenu({
                position: { x: left, y: top },
                content: (
                    <>
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
                        {showCreate && showEdit && <ContextMenuSeparator />}
                        {showEdit && node && (
                            <>
                                <ContextMenuColorRow
                                    colors={DEFAULT_ITEM_COLORS}
                                    selected={node.color}
                                    onSelect={(color) => setColor(node.id, color)}
                                />
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
                    </>
                ),
            });
        },
        [updateContextMenu, t, createInside, setColor],
    );

    const openMenu = useCallback(
        (node: DocumentNode | null, e: React.MouseEvent) => {
            e.preventDefault();
            openMenuAt(node, e.clientX, e.clientY);
        },
        [openMenuAt],
    );

    // ---- Touch long-press ----
    // iOS/WebKit never dispatches `contextmenu`, so the right-click above has no
    // touch equivalent: a hold on the tree fell through to the native text
    // selection (grabbing whatever sat behind the drawer) and no menu opened,
    // leaving no way to create anything at the root on a phone. Hold still to
    // open the same menu — on a row for that node, on empty space for the root.
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gestureAbortRef = useRef<AbortController | null>(null);

    // Cancel a pending long-press and tear down that gesture's listeners.
    const stopLongPress = useCallback(() => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
        gestureAbortRef.current?.abort();
        gestureAbortRef.current = null;
    }, []);

    // Abandon any in-flight gesture if the tab/panel unmounts mid-press.
    useEffect(() => stopLongPress, [stopLongPress]);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            if (!touch) return;
            const target = e.target as HTMLElement;
            // The ⋮ button, the rename field and the delete-confirm buttons own
            // their own taps.
            if (target.closest("button, input")) return;

            stopLongPress(); // abandon any gesture still in flight (e.g. a second finger)

            const startX = touch.clientX;
            const startY = touch.clientY;
            const pressedId = target.closest<HTMLElement>("[data-doc-id]")?.dataset.docId;
            const node = pressedId ? (documents[pressedId] ?? null) : null;

            const controller = new AbortController();
            gestureAbortRef.current = controller;
            const { signal } = controller;
            let fired = false;

            longPressRef.current = setTimeout(() => {
                fired = true;
                openMenuAt(node, startX, startY);
            }, LONG_PRESS_MS);

            window.addEventListener(
                "touchmove",
                (ev) => {
                    const move = ev.touches[0];
                    if (!move) return;
                    // A real move means the user is scrolling the list, not holding.
                    if (Math.hypot(move.clientX - startX, move.clientY - startY) > LONG_PRESS_CANCEL_PX) {
                        stopLongPress();
                    }
                },
                { passive: true, signal },
            );

            const onEnd = () => {
                const opened = fired;
                stopLongPress();
                if (opened) swallowNextClick();
            };
            window.addEventListener("touchend", onEnd, { signal });
            window.addEventListener("touchcancel", onEnd, { signal });
        },
        [documents, openMenuAt, stopLongPress],
    );

    // Touch-only "+" in the header: with a long list there can be no empty space
    // left to long-press, so the root create actions always stay reachable.
    const handleHeaderMenu = useCallback(
        (e: React.MouseEvent) => {
            // Don't let this reach the host's close-on-click handler, which would
            // shut the menu again right after it opens.
            e.stopPropagation();
            if (contextMenu) {
                updateContextMenu(undefined);
                return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAt(null, rect.left, rect.bottom);
        },
        [contextMenu, updateContextMenu, openMenuAt],
    );

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

    return (
        <>
            <div className={sidebar_nav.list_header}>
                <FolderTree size={18} />
                <p className={form.label}>{t("documents")}</p>
                <button
                    className={sidebar_nav.header_btn}
                    onClick={handleHeaderMenu}
                    aria-label={t("newDocument")}
                >
                    <Plus size={16} />
                </button>
            </div>
            <div
                className={join(sidebar_nav.list, sidebar_nav.scene_list, sidebar_nav.tree_list)}
                onContextMenu={(e) => openMenu(null, e)}
                onTouchStart={handleTouchStart}
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
                    <div className={sidebar_nav.empty_state}>
                        <div className={sidebar_nav.empty_actions}>
                            <button
                                className={sidebar_nav.empty_action}
                                onClick={() => createInside(null, "folder")}
                            >
                                <FolderPlus size={16} />
                                {t("newFolder")}
                            </button>
                            <button
                                className={sidebar_nav.empty_action}
                                onClick={() => createInside(null, "editor")}
                            >
                                <FilePlus size={16} />
                                {t("newDocument")}
                            </button>
                            <button
                                className={sidebar_nav.empty_action}
                                onClick={() => createInside(null, "board")}
                            >
                                <LayoutDashboard size={16} />
                                {t("newBoard")}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default DocumentTreeSidebarView;
