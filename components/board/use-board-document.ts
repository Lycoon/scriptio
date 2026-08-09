"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { ProjectContext } from "@src/context/ProjectContext";
import { BoardArrowData, BoardCardData } from "@src/lib/project/project-state";

export type BoardDocument = ReturnType<typeof useBoardDocument>;

/**
 * The board's cards and arrows, kept in sync with the project's Yjs document.
 *
 * Both lists are mirrored into refs alongside their state. Every mutation
 * composes onto the ref rather than onto the state its closure captured: a
 * gesture emits several updates inside a single React batch (one slash of the
 * cut tool deletes several arrows across consecutive move frames), and starting
 * from stale state would undo the ones before it. It also keeps the mutation
 * callbacks identity-stable, which matters because they are props of a memoised
 * BoardCard — a fresh identity per frame re-renders every card on the board.
 *
 * `onFirstLoad` fires once, with the cards the board opened on, for the caller
 * to place its camera.
 */
export function useBoardDocument(docId: string, onFirstLoad: (cards: BoardCardData[]) => void) {
    const { repository, isYjsReady, isReadOnly } = useContext(ProjectContext);
    const projectState = repository?.getState();

    const [cards, setCards] = useState<BoardCardData[]>([]);
    const cardsRef = useRef<BoardCardData[]>([]);
    const [arrows, setArrows] = useState<BoardArrowData[]>([]);
    const arrowsRef = useRef<BoardArrowData[]>([]);

    const hasLoaded = useRef(false);
    /** Last `cards` payload this client wrote, to recognise the observer's echo. */
    const lastSavedCards = useRef<string | null>(null);

    // Read through a ref so a caller that rebuilds the callback doesn't tear the
    // board's Yjs subscription down and back up.
    const onFirstLoadRef = useRef(onFirstLoad);
    useEffect(() => {
        onFirstLoadRef.current = onFirstLoad;
    }, [onFirstLoad]);

    useEffect(() => {
        if (!projectState || !isYjsReady) return;

        const boardMap = projectState.boardData(docId);

        const syncFromDoc = () => {
            const cardsData = boardMap.get("cards");
            // Y.Map observers fire for local writes too, so our own save echoes
            // straight back. Re-parsing it would rebuild every card object and
            // re-render the whole board a second time for a state it is already
            // in — pure waste, and paid on every committed drag. (Arrows below
            // are still synced: a peer may have touched those and nothing else.)
            const isOwnEcho =
                hasLoaded.current &&
                typeof cardsData === "string" &&
                cardsData === lastSavedCards.current;

            if (isOwnEcho) {
                // nothing to apply: local state already is this payload
            } else if (cardsData) {
                try {
                    const parsed: BoardCardData[] =
                        typeof cardsData === "string" ? JSON.parse(cardsData) : cardsData;
                    cardsRef.current = parsed;
                    setCards(parsed);
                    if (!hasLoaded.current) {
                        hasLoaded.current = true;
                        onFirstLoadRef.current(parsed);
                    }
                } catch (e) {
                    console.error("[BoardCanvas] Failed to parse cards:", e);
                }
            } else if (!hasLoaded.current) {
                // Empty board — nothing to frame, but the camera is settled.
                hasLoaded.current = true;
                onFirstLoadRef.current([]);
            }

            const arrowsData = boardMap.get("arrows");
            if (arrowsData) {
                try {
                    const parsed: BoardArrowData[] =
                        typeof arrowsData === "string" ? JSON.parse(arrowsData) : arrowsData;
                    arrowsRef.current = parsed;
                    setArrows(parsed);
                } catch (e) {
                    console.error("[BoardCanvas] Failed to parse arrows:", e);
                }
            }
        };

        syncFromDoc();
        boardMap.observe(syncFromDoc);
        return () => boardMap.unobserve(syncFromDoc);
    }, [projectState, isYjsReady, docId]);

    const getCards = useCallback(() => cardsRef.current, []);

    /**
     * Land a card-list change everywhere it has to go: the ref the next mutation
     * composes onto, the render state, and Yjs.
     *
     * `transient` marks a frame of a live drag/resize. Those only move local
     * state: writing to Yjs per frame stringifies the entire board, opens a
     * transaction (which fans out to persistence and to every peer) and then
     * echoes back through the observer — tens of times a second, for a position
     * that is about to change again. The gesture's last update is sent without
     * the flag and is what actually gets stored (see BoardCard's commit).
     */
    const commitCards = useCallback(
        (newCards: BoardCardData[], options?: { transient?: boolean }) => {
            cardsRef.current = newCards;
            setCards(newCards);
            if (options?.transient || !projectState || !isYjsReady || isReadOnly) return;
            const payload = JSON.stringify(newCards);
            lastSavedCards.current = payload; // so the observer can skip its echo
            projectState.boardData(docId).set("cards", payload);
        },
        [projectState, isYjsReady, isReadOnly, docId],
    );

    /**
     * Same for arrows. Read-only sessions stop before touching local state
     * rather than just skipping the save, which would leave the board showing
     * links the project doesn't have.
     */
    const commitArrows = useCallback(
        (newArrows: BoardArrowData[]) => {
            if (isReadOnly) return;
            arrowsRef.current = newArrows;
            setArrows(newArrows);
            if (!projectState || !isYjsReady) return;
            projectState.boardData(docId).set("arrows", JSON.stringify(newArrows));
        },
        [projectState, isYjsReady, isReadOnly, docId],
    );

    /** Link two cards. Self-links and pairs already joined either way are no-ops. */
    const addArrow = useCallback(
        (fromCardId: string, toCardId: string) => {
            if (fromCardId === toCardId) return;
            const exists = arrowsRef.current.some(
                (a) =>
                    (a.fromCardId === fromCardId && a.toCardId === toCardId) ||
                    (a.fromCardId === toCardId && a.toCardId === fromCardId),
            );
            if (exists) return;
            commitArrows([...arrowsRef.current, { id: uuidv7(), fromCardId, toCardId }]);
        },
        [commitArrows],
    );

    const removeArrow = useCallback(
        (id: string) => {
            const newArrows = arrowsRef.current.filter((a) => a.id !== id);
            if (newArrows.length !== arrowsRef.current.length) commitArrows(newArrows);
        },
        [commitArrows],
    );

    /** Drop every arrow touching the given card (it is going away). */
    const removeArrowsForCard = useCallback(
        (cardId: string) => {
            commitArrows(
                arrowsRef.current.filter((a) => a.fromCardId !== cardId && a.toCardId !== cardId),
            );
        },
        [commitArrows],
    );

    return {
        cards,
        /** The live card list, for handlers that compose several edits per frame. */
        getCards,
        commitCards,
        arrows,
        commitArrows,
        addArrow,
        removeArrow,
        removeArrowsForCard,
    };
}
