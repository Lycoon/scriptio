"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { SplitSide, useViewContext } from "@src/context/ViewContext";
import { BoardCardData, MAIN_SCREENPLAY_REF, OutlineItem } from "@src/lib/project/project-state";
import { TransientScene } from "@src/lib/screenplay/scenes";
import { focusOnPosition } from "@src/lib/screenplay/editor";
import OutlineBlock, { DropPosition } from "./OutlineItem";

import styles from "./OutlineView.module.css";

/** Live-resolved display data for an outline block. */
export type ResolvedOutline = {
    title: string;
    preview: string;
    color?: string;
    /** True when the referenced source element no longer exists. */
    missing: boolean;
    /** Editor position of a resolved scene (for navigation). */
    position?: number;
};

const PREVIEW_MAX = 80;

const truncate = (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > PREVIEW_MAX ? clean.slice(0, PREVIEW_MAX).trimEnd() + "…" : clean;
};

const parseCards = (raw: unknown): BoardCardData[] => {
    if (!raw) return [];
    try {
        return typeof raw === "string" ? (JSON.parse(raw) as BoardCardData[]) : (raw as BoardCardData[]);
    } catch {
        return [];
    }
};

const OutlineView = ({ isVisible }: { isVisible: boolean }) => {
    const { outline, repository, scenes, editor, documentEditor, setBoardFocusCardId } =
        useContext(ProjectContext);
    const { isSplit, primaryPanel, setSidePanel, setFocusedSide, setSideDocument } = useViewContext();
    const projectState = repository?.getState();

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null);

    // Children of a parent (null = root), sorted by fractional `order`.
    const childrenOf = useCallback(
        (parentId: string | null): OutlineItem[] =>
            Object.values(outline)
                .filter((n) => (n.parentId ?? null) === (parentId ?? null))
                .sort((a, b) => a.order - b.order),
        [outline],
    );

    const roots = useMemo(() => childrenOf(null), [childrenOf]);

    const appendOrder = useCallback(
        (parentId: string | null, excludeId?: string) => {
            const kids = childrenOf(parentId).filter((n) => n.id !== excludeId);
            return kids.length ? kids[kids.length - 1].order + 1 : 0;
        },
        [childrenOf],
    );

    // ---- Live resolution of references ----

    // Distinct source documents referenced by current blocks.
    const cardBoardIds = useMemo(
        () => [...new Set(Object.values(outline).filter((i) => i.source === "card").map((i) => i.refDocId))],
        [outline],
    );
    const editorDocIds = useMemo(
        () =>
            [
                ...new Set(
                    Object.values(outline)
                        .filter((i) => i.source === "scene" && i.refDocId !== MAIN_SCREENPLAY_REF)
                        .map((i) => i.refDocId),
                ),
            ],
        [outline],
    );

    // Bump a counter whenever a referenced board / editor-doc changes, so the
    // resolver recomputes. Main-screenplay scenes come from `scenes` (reactive).
    const [sourceVersion, setSourceVersion] = useState(0);
    const cardKey = cardBoardIds.join(",");
    const editorKey = editorDocIds.join(",");
    useEffect(() => {
        if (!projectState) return;
        const bump = () => setSourceVersion((v) => v + 1);
        const unsubs: (() => void)[] = [];
        for (const id of cardBoardIds) {
            const map = projectState.boardData(id);
            map.observe(bump);
            unsubs.push(() => map.unobserve(bump));
        }
        for (const id of editorDocIds) {
            const frag = projectState.documentFragment(id);
            frag.observe(bump);
            unsubs.push(() => frag.unobserve(bump));
        }
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectState, cardKey, editorKey]);

    const resolved = useMemo<Record<string, ResolvedOutline>>(() => {
        const out: Record<string, ResolvedOutline> = {};

        // Lookups for the main screenplay scenes (already live via context).
        const mainScenes = new Map(scenes.filter((s) => s.id).map((s) => [s.id as string, s]));

        // Parse each referenced editor document's scenes once.
        const editorScenes = new Map<string, Map<string, TransientScene>>();
        for (const id of editorDocIds) {
            const list = repository?.getEditorDocumentScenes(id) ?? [];
            editorScenes.set(id, new Map(list.filter((s) => s.id).map((s) => [s.id as string, s])));
        }

        // Parse each referenced board's cards once.
        const boardCards = new Map<string, Map<string, BoardCardData>>();
        for (const id of cardBoardIds) {
            const cards = parseCards(projectState?.boardData(id).get("cards"));
            boardCards.set(id, new Map(cards.map((c) => [c.id, c])));
        }

        for (const item of Object.values(outline)) {
            if (item.source === "card") {
                const card = boardCards.get(item.refDocId)?.get(item.refId);
                out[item.id] = card
                    ? { title: card.title, preview: truncate(card.description), color: card.color, missing: false }
                    : { title: item.title, preview: item.preview, color: item.color, missing: true };
            } else {
                const scene =
                    item.refDocId === MAIN_SCREENPLAY_REF
                        ? mainScenes.get(item.refId)
                        : editorScenes.get(item.refDocId)?.get(item.refId);
                if (scene) {
                    const synopsis = "synopsis" in scene ? (scene.synopsis as string | undefined) : undefined;
                    const color = "color" in scene ? (scene.color as string | undefined) : undefined;
                    out[item.id] = {
                        title: scene.title,
                        preview: truncate(synopsis || scene.preview),
                        color,
                        missing: false,
                        position: scene.position,
                    };
                } else {
                    out[item.id] = { title: item.title, preview: item.preview, color: item.color, missing: true };
                }
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [outline, scenes, sourceVersion, cardKey, editorKey, repository, projectState]);

    // Keep each block's cached snapshot fresh so the "unlinked" fallback shows
    // the last-known title/preview/color. Only writes when a resolved value
    // actually changed (and the source still exists), so it settles quickly.
    // Gated on visibility to avoid background writes for an unseen panel.
    useEffect(() => {
        if (!repository || !isVisible) return;
        for (const item of Object.values(outline)) {
            const r = resolved[item.id];
            if (!r || r.missing) continue;
            if (r.title !== item.title || r.preview !== item.preview || (r.color ?? undefined) !== (item.color ?? undefined)) {
                repository.refreshOutlineSnapshot(item.id, { title: r.title, preview: r.preview, color: r.color });
            }
        }
    }, [repository, outline, resolved, isVisible]);

    // ---- Navigation ----

    // Best-effort focus of a freshly opened document editor needs the latest
    // instance, so track it in a ref.
    const documentEditorRef = useRef(documentEditor);
    documentEditorRef.current = documentEditor;

    const navigate = useCallback(
        (item: OutlineItem) => {
            const r = resolved[item.id];
            if (!r || r.missing) return;

            // Open in the panel next to the Outline, leaving the Outline in place.
            // When unsplit there's only one panel, so the target takes it over.
            const targetSide: SplitSide = isSplit ? (primaryPanel === "outline" ? "secondary" : "primary") : "primary";

            if (item.source === "card") {
                setSideDocument(targetSide, item.refDocId, "board");
                setBoardFocusCardId(item.refId);
                return;
            }

            // Scene
            if (item.refDocId === MAIN_SCREENPLAY_REF) {
                setSidePanel(targetSide, "screenplay");
                setFocusedSide(targetSide);
                if (editor && r.position !== undefined) focusOnPosition(editor, r.position);
                return;
            }

            // Scene inside an editor document.
            setSideDocument(targetSide, item.refDocId, "document");
            if (r.position !== undefined) {
                const pos = r.position;
                window.setTimeout(() => {
                    const ed = documentEditorRef.current;
                    if (ed) focusOnPosition(ed, pos);
                }, 350);
            }
        },
        [resolved, editor, isSplit, primaryPanel, setSideDocument, setSidePanel, setFocusedSide, setBoardFocusCardId],
    );

    const remove = useCallback(
        (id: string) => {
            repository?.deleteOutlineItem(id);
        },
        [repository],
    );

    // ---- Drag & drop (mirrors DocumentTreeSidebarView) ----

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
            const target = outline[targetId];
            const pos = dropTarget?.pos;
            resetDrag();
            if (!repository || !dragId || !target || !pos || dragId === targetId) return;

            if (pos === "into") {
                repository.moveOutlineItem(dragId, target.id, appendOrder(target.id, dragId));
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
            repository.moveOutlineItem(dragId, parentId, order);
        },
        [draggingId, outline, dropTarget, repository, appendOrder, childrenOf, resetDrag],
    );

    const onDropRoot = useCallback(() => {
        const dragId = draggingId;
        resetDrag();
        if (!repository || !dragId) return;
        repository.moveOutlineItem(dragId, null, appendOrder(null, dragId));
    }, [draggingId, repository, appendOrder, resetDrag]);

    return (
        <div className={styles.outline_panel}>
            <div
                className={styles.outline_scroll}
                onDragOver={(e) => {
                    if (!draggingId) return;
                    // Over empty space (not a block): clear the block indicator;
                    // dropping here still moves the item to the root level.
                    e.preventDefault();
                    setDropTarget(null);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    onDropRoot();
                }}
            >
                <div className={styles.outline_list}>
                    {roots.map((node) => (
                        <OutlineBlock
                            key={node.id}
                            node={node}
                            depth={0}
                            childrenOf={childrenOf}
                            resolved={resolved}
                            onNavigate={navigate}
                            onRemove={remove}
                            draggingId={draggingId}
                            dropTarget={dropTarget}
                            onDragStart={onDragStart}
                            onDragOverNode={onDragOverNode}
                            onDropNode={onDropNode}
                            onDragEnd={resetDrag}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OutlineView;
