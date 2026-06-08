"use client";

import { useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { useViewContext } from "@src/context/ViewContext";
import { DocumentNode } from "@src/lib/project/project-state";
import { join } from "@src/lib/utils/misc";
import { FilePlus, FolderPlus, FolderTree, LayoutDashboard } from "lucide-react";
import DocumentTreeItem, { DropPosition } from "./DocumentTreeItem";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

const DocumentTreeSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { documents, repository, activeDocument, setActiveDocument } = useContext(ProjectContext);
    const { setSecondaryPanel } = useViewContext();

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null);
    const [rootDrop, setRootDrop] = useState(false);

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
            if (node.type === "board") {
                setActiveDocument({ docId: node.id, type: "board" });
                setSecondaryPanel("board");
            } else if (node.type === "editor") {
                setActiveDocument({ docId: node.id, type: "editor" });
                setSecondaryPanel("document");
            }
        },
        [setActiveDocument, setSecondaryPanel],
    );

    const createChild = useCallback(
        (parentId: string | null, type: "folder" | "editor") => {
            if (!repository) return;
            if (type === "folder") repository.createFolder(t("untitledFolder"), parentId);
            else repository.createEditorDocument(t("untitledDocument"), parentId);
        },
        [repository, t],
    );

    const createBoard = useCallback(() => {
        repository?.createBoardDocument(t("boardTitle"), null);
    }, [repository, t]);

    const renameDocument = useCallback(
        (id: string, title: string) => repository?.renameDocument(id, title),
        [repository],
    );

    const deleteDocument = useCallback(
        (id: string) => {
            if (!repository) return;
            // Clear the open document if it (or one of its descendants) is being removed.
            const removed = new Set<string>();
            const stack = [id];
            while (stack.length) {
                const cur = stack.pop()!;
                removed.add(cur);
                for (const n of Object.values(documents)) if (n.parentId === cur) stack.push(n.id);
            }
            if (activeDocument && removed.has(activeDocument.docId)) setActiveDocument(null);
            repository.deleteDocument(id);
        },
        [repository, documents, activeDocument, setActiveDocument],
    );

    // ---- Drag & drop ----
    const onDragStart = useCallback((id: string) => setDraggingId(id), []);

    const onDragOverNode = useCallback(
        (id: string, pos: DropPosition) => {
            setRootDrop(false);
            setDropTarget((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }));
        },
        [],
    );

    const resetDrag = useCallback(() => {
        setDraggingId(null);
        setDropTarget(null);
        setRootDrop(false);
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
                <div className={sidebar_nav.header_spacer} />
                <div className={sidebar_nav.header_actions}>
                    <button
                        className={sidebar_nav.header_btn}
                        title={t("newDocument")}
                        onClick={() => createChild(null, "editor")}
                    >
                        <FilePlus size={15} />
                    </button>
                    <button
                        className={sidebar_nav.header_btn}
                        title={t("newFolder")}
                        onClick={() => createChild(null, "folder")}
                    >
                        <FolderPlus size={15} />
                    </button>
                    <button className={sidebar_nav.header_btn} title={t("newBoard")} onClick={createBoard}>
                        <LayoutDashboard size={15} />
                    </button>
                </div>
            </div>
            <div
                className={join(sidebar_nav.list, sidebar_nav.scene_list, rootDrop ? sidebar_nav.tree_root_drop : "")}
                onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    setDropTarget(null);
                    setRootDrop(true);
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
                            activeDocId={activeDocument?.docId ?? null}
                            onOpen={openDocument}
                            onCreateChild={createChild}
                            onRename={renameDocument}
                            onDelete={deleteDocument}
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
        </>
    );
};

export default DocumentTreeSidebarView;
