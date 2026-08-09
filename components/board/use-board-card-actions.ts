"use client";

import { useCallback, useContext } from "react";
import { v7 as uuidv7 } from "uuid";
import { ProjectContext } from "@src/context/ProjectContext";
import { BoardCardData } from "@src/lib/project/project-state";
import { scheduleAssetGc } from "@src/lib/assets/asset-gc";
import { createTextCard } from "./board-cards";
import { BoardDocument } from "./use-board-document";

export type BoardCardActions = ReturnType<typeof useBoardCardActions>;

/**
 * Everything the board does *to* cards — create, move, recolour, duplicate,
 * delete, send to the timeline.
 *
 * All of it reads the card list through the document's ref rather than through
 * render state, both to compose correctly within a batch and to keep these
 * callbacks identity-stable: several are props of a memoised BoardCard, where a
 * new identity per frame would re-render every card on the board.
 */
export function useBoardCardActions(
    doc: BoardDocument,
    options: {
        docId: string;
        isSnapping: boolean;
        selectedCardIds: Set<string>;
        clearSelection: () => void;
    },
) {
    const { projectId, repository } = useContext(ProjectContext);
    const projectState = repository?.getState();
    const { getCards, commitCards, removeArrowsForCard } = doc;
    const { docId, isSnapping, selectedCardIds, clearSelection } = options;

    const addCards = useCallback(
        (newCards: BoardCardData[]) => commitCards([...getCards(), ...newCards]),
        [getCards, commitCards],
    );

    /** Remove cards by id (also used to roll back a card whose asset can't be saved). */
    const removeCards = useCallback(
        (ids: Set<string>) => commitCards(getCards().filter((c) => !ids.has(c.id))),
        [getCards, commitCards],
    );

    /** Create a text card at the given canvas-space coords. */
    const createCard = useCallback(
        (x: number, y: number) => {
            clearSelection();
            addCards([createTextCard(x, y, isSnapping)]);
        },
        [clearSelection, addCards, isSnapping],
    );

    const duplicateCard = useCallback(
        (card: BoardCardData) => {
            addCards([{ ...card, id: uuidv7(), x: card.x + 20, y: card.y + 20 }]);
        },
        [addCards],
    );

    const changeCardColor = useCallback(
        (id: string, color: string) => {
            commitCards(getCards().map((c) => (c.id === id ? { ...c, color } : c)));
        },
        [getCards, commitCards],
    );

    /** Delete a card, the links that hung off it, and any asset it orphaned. */
    const deleteCard = useCallback(
        (id: string) => {
            removeCards(new Set([id]));
            removeArrowsForCard(id);
            // Deleting an image card may orphan its asset — reconcile (debounced).
            if (projectId && projectState) scheduleAssetGc(projectId, projectState);
        },
        [removeCards, removeArrowsForCard, projectId, projectState],
    );

    /**
     * Apply a card's new geometry, dragging the rest of the selection along when
     * the card being moved is part of a multi-selection. Resizes stay single-card.
     */
    const updateCard = useCallback(
        (updatedCard: BoardCardData, options?: { transient?: boolean }) => {
            const current = getCards();
            const isMultiDrag = selectedCardIds.has(updatedCard.id) && selectedCardIds.size > 1;

            if (isMultiDrag) {
                const oldCard = current.find((c) => c.id === updatedCard.id);
                const dx = oldCard ? updatedCard.x - oldCard.x : 0;
                const dy = oldCard ? updatedCard.y - oldCard.y : 0;
                const isResize =
                    !!oldCard &&
                    (updatedCard.width !== oldCard.width || updatedCard.height !== oldCard.height);

                if ((dx !== 0 || dy !== 0) && !isResize) {
                    commitCards(
                        current.map((c) => {
                            if (c.id === updatedCard.id) return updatedCard;
                            if (selectedCardIds.has(c.id)) return { ...c, x: c.x + dx, y: c.y + dy };
                            return c;
                        }),
                        options,
                    );
                    return;
                }
            }

            commitCards(
                current.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
                options,
            );
        },
        [getCards, commitCards, selectedCardIds],
    );

    /**
     * Send a card to the Timeline — to a specific layer when `layerId` is given,
     * otherwise to the default (first root) lane.
     */
    const sendToTimeline = useCallback(
        (card: BoardCardData, layerId?: string) => {
            repository?.appendTimelineClip(
                {
                    source: "card",
                    refDocId: docId,
                    refId: card.id,
                    title: card.title,
                    preview: card.description,
                    color: card.color,
                },
                undefined,
                layerId,
            );
        },
        [repository, docId],
    );

    return {
        addCards,
        removeCards,
        createCard,
        duplicateCard,
        changeCardColor,
        deleteCard,
        updateCard,
        sendToTimeline,
    };
}
