"use client";

import { useMemo } from "react";
import { BoardArrowData, BoardCardData } from "@src/lib/project/project-state";
import styles from "./BoardCanvas.module.css";
import { buildArrowPath, buildConnectingPath, Point } from "./board-geometry";

type BoardArrowsProps = {
    cards: BoardCardData[];
    arrows: BoardArrowData[];
    /** The cut tool is armed: widen the hitboxes and let clicks sever links. */
    cutMode: boolean;
    /** Card a link is currently being dragged out of, and where the pointer is. */
    connectingFromCardId: string | null;
    connectingLine: Point | null;
    onArrowContextMenu: (e: React.MouseEvent, arrow: BoardArrowData) => void;
    onCutArrow: (id: string) => void;
};

/** The links between cards, drawn under them. */
const BoardArrows = ({
    cards,
    arrows,
    cutMode,
    connectingFromCardId,
    connectingLine,
    onArrowContextMenu,
    onCutArrow,
}: BoardArrowsProps) => {
    const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
    const connectingFromCard = connectingFromCardId ? cardsById.get(connectingFromCardId) : null;

    return (
        <svg className={styles.arrows_svg}>
            {arrows.map((arrow) => {
                const fromCard = cardsById.get(arrow.fromCardId);
                const toCard = cardsById.get(arrow.toCardId);
                if (!fromCard || !toCard) return null;

                const { pathD, arrowheadD } = buildArrowPath(fromCard, toCard);

                return (
                    <g
                        key={arrow.id}
                        className={`${styles.arrow_group} ${cutMode ? styles.arrow_group_cut : ""}`}
                    >
                        {/* Invisible hitbox for easier clicking. Also what the cut
                            tool hit-tests against, hence the id (see cutArrowAt). */}
                        <path
                            className={styles.arrow_hitbox}
                            data-arrow-id={arrow.id}
                            d={pathD}
                            fill="none"
                            onContextMenu={(e) => onArrowContextMenu(e, arrow)}
                            // Trackpad/mouse counterpart of the slash — an iPad
                            // reports a coarse pointer with a Magic Keyboard
                            // attached, so the tool has to answer to both.
                            onMouseDown={
                                cutMode
                                    ? (e) => {
                                          e.stopPropagation();
                                          onCutArrow(arrow.id);
                                      }
                                    : undefined
                            }
                        />
                        <path
                            className={styles.arrow_line}
                            d={pathD}
                            fill="none"
                            stroke="var(--secondary-text)"
                            strokeWidth={2.5}
                        />
                        <path
                            className={styles.arrow_head}
                            d={arrowheadD}
                            fill="var(--secondary-text)"
                        />
                    </g>
                );
            })}

            {/* Pending link, following the pointer */}
            {connectingFromCard && connectingLine && (
                <path
                    className={styles.arrow_line_connecting}
                    d={buildConnectingPath(connectingFromCard, connectingLine)}
                    fill="none"
                    stroke="var(--secondary-text)"
                    strokeWidth={2.5}
                    strokeDasharray="8,4"
                />
            )}
        </svg>
    );
};

export default BoardArrows;
