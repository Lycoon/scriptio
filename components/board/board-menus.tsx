"use client";

import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Copy, Image as ImageIcon, Layers, ListTree, Mic, Plus, Trash2 } from "lucide-react";
import {
    ContextMenuColorRow,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSubmenu,
} from "@components/utils/ContextMenu";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { BoardArrowData, BoardCardData, TimelineLayer } from "@src/lib/project/project-state";
import { DEFAULT_ITEM_COLORS } from "@src/lib/utils/colors";
import styles from "./BoardCanvas.module.css";
import { BoardCamera } from "./use-board-camera";

type BoardMenuActions = {
    canRecord: boolean;
    createCard: (x: number, y: number) => void;
    importImage: (x: number, y: number) => void;
    recordAudio: (x: number, y: number) => void;
    changeCardColor: (id: string, color: string) => void;
    duplicateCard: (card: BoardCardData) => void;
    sendToTimeline: (card: BoardCardData, layerId?: string) => void;
    deleteCard: (id: string) => void;
    deleteArrow: (id: string) => void;
};

/**
 * The board's three context menus — empty canvas, card, arrow — as openers that
 * hand their content to the shared menu host.
 */
export function useBoardMenus(camera: BoardCamera, actions: BoardMenuActions) {
    const { isReadOnly, repository, timelineLayers } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const t = useTranslations("board");
    // Used only to name the default lanes when the board seeds them (below).
    const tTimeline = useTranslations("timeline");
    const { toCanvasPoint } = camera;

    // The openers must keep a stable identity — `showCardMenu` is a prop of a
    // memoised BoardCard, so a new one per render would re-render every card on
    // the board. Reading the actions through a ref means the caller can pass a
    // plain object literal without any of that leaking out. Menus are only ever
    // built from an event handler, long after this has been filled in.
    const actionsRef = useRef(actions);
    useEffect(() => {
        actionsRef.current = actions;
    });

    // Timeline layers flattened into display order (depth-annotated), mirroring
    // the Timeline panel's tree so the "Send to timeline" submenu matches it.
    const orderedLayers = useMemo(() => {
        const out: { layer: TimelineLayer; depth: number }[] = [];
        const childrenOf = (parentId: string | null) =>
            Object.values(timelineLayers)
                .filter((l) => (l.parentId ?? null) === parentId)
                .sort((a, b) => a.order - b.order);
        const walk = (parentId: string | null, depth: number) => {
            for (const layer of childrenOf(parentId)) {
                out.push({ layer, depth });
                walk(layer.id, depth + 1);
            }
        };
        walk(null, 0);
        return out;
    }, [timelineLayers]);

    /**
     * Lanes to offer in the "Send to timeline" submenu. The default lanes are
     * otherwise only seeded when the Timeline panel is first opened, so a
     * board-first user got an empty list (and a flat menu item) until they'd
     * either opened the timeline or sent a card once — `appendTimelineClip`
     * seeds too. Seeding here as well keeps the lanes listed on the very first
     * right-click. Idempotent, and a no-op on a read-only project.
     */
    const resolveTimelineLayers = useCallback(() => {
        if (orderedLayers.length > 0) return orderedLayers;
        const seeded =
            repository?.ensureTimelineLayers(2, (i) => `${tTimeline("layer")} ${i + 1}`) ?? [];
        return seeded.map((layer) => ({ layer, depth: 0 }));
    }, [orderedLayers, repository, tTimeline]);

    /**
     * Build the empty-canvas menu (create card / import image / record audio) at
     * the given *screen* coords, resolving the canvas-space drop point via the camera.
     */
    const showCanvasMenu = useCallback(
        (screenX: number, screenY: number) => {
            if (isReadOnly) return;
            const { x, y } = toCanvasPoint(screenX, screenY);
            updateContextMenu({
                position: { x: screenX, y: screenY },
                content: (
                    <>
                        <ContextMenuItem
                            icon={Plus}
                            text={t("createCard")}
                            action={() => actionsRef.current.createCard(x, y)}
                        />
                        <ContextMenuItem
                            icon={ImageIcon}
                            text={t("importImage")}
                            action={() => actionsRef.current.importImage(x, y)}
                        />
                        <ContextMenuItem
                            icon={Mic}
                            text={t("recordAudio")}
                            action={() => actionsRef.current.recordAudio(x, y)}
                            disabled={!actionsRef.current.canRecord}
                            title={actionsRef.current.canRecord ? undefined : t("audioUnsupported")}
                        />
                    </>
                ),
            });
        },
        [isReadOnly, toCanvasPoint, updateContextMenu, t],
    );

    // Right-clicking empty canvas opens the menu. Cards and arrows have their own
    // menus, so bail when the click landed on one.
    const handleCanvasContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (isReadOnly) return;
            const target = e.target as HTMLElement;
            if (
                target.closest(`.${styles.card}`) ||
                target.closest(`.${styles.arrow_group}`) ||
                target.closest("[data-context-menu]") ||
                target.closest(`.${styles.zoom_controls}`)
            )
                return;
            e.preventDefault();
            showCanvasMenu(e.clientX, e.clientY);
        },
        [isReadOnly, showCanvasMenu],
    );

    const showCardMenu = useCallback(
        (e: React.MouseEvent, card: BoardCardData) => {
            const layers = resolveTimelineLayers();
            updateContextMenu({
                position: { x: e.clientX, y: e.clientY },
                content: (
                    <>
                        {/* Color applies to text + audio notes; image cards have none. */}
                        {card.type !== "image" && (
                            <>
                                <ContextMenuColorRow
                                    colors={DEFAULT_ITEM_COLORS}
                                    selected={card.color}
                                    onSelect={(color) => actionsRef.current.changeCardColor(card.id, color)}
                                />
                                <ContextMenuSeparator />
                            </>
                        )}
                        <ContextMenuItem
                            icon={Copy}
                            text={t("duplicate")}
                            action={() => actionsRef.current.duplicateCard(card)}
                        />
                        {(card.type ?? "text") === "text" &&
                            (layers.length > 0 ? (
                                <ContextMenuSubmenu icon={ListTree} text={t("sendToTimeline")}>
                                    {layers.map(({ layer, depth }) => (
                                        <ContextMenuItem
                                            key={layer.id}
                                            icon={Layers}
                                            indent={depth * 14}
                                            text={layer.name || t("untitled")}
                                            action={() => actionsRef.current.sendToTimeline(card, layer.id)}
                                        />
                                    ))}
                                </ContextMenuSubmenu>
                            ) : (
                                <ContextMenuItem
                                    icon={ListTree}
                                    text={t("sendToTimeline")}
                                    action={() => actionsRef.current.sendToTimeline(card)}
                                />
                            ))}
                        <ContextMenuItem
                            icon={Trash2}
                            text={t("delete")}
                            action={() => actionsRef.current.deleteCard(card.id)}
                        />
                    </>
                ),
            });
        },
        [updateContextMenu, t, resolveTimelineLayers],
    );

    const showArrowMenu = useCallback(
        (e: React.MouseEvent, arrow: BoardArrowData) => {
            e.preventDefault();
            e.stopPropagation();
            updateContextMenu({
                position: { x: e.clientX, y: e.clientY },
                content: (
                    <ContextMenuItem
                        icon={Trash2}
                        text={t("delete")}
                        action={() => actionsRef.current.deleteArrow(arrow.id)}
                    />
                ),
            });
        },
        [updateContextMenu, t],
    );

    return { showCanvasMenu, handleCanvasContextMenu, showCardMenu, showArrowMenu };
}
