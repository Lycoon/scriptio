/** Tunables shared by the board canvas, its hooks and its geometry helpers. */

export const GRID_SIZE = 20;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;
/**
 * Tile size (screen px) the grid's `background-size` is rounded to. Changing
 * background-size is a paint op, so a continuous pinch would otherwise repaint
 * a full-viewport gradient every frame; snapping to 4px steps means a full
 * MIN_SCALE→MAX_SCALE sweep repaints under a dozen times total instead of once
 * per frame, with no visible difference in dot spacing.
 */
export const GRID_TILE_QUANTUM = 4;
/** Largest edge (in canvas px) an image card is sized to on first drop. */
export const MAX_IMAGE_CARD_SIZE = 400;
/** Default size (in canvas px) of an audio voice-note card. */
export const AUDIO_CARD_WIDTH = 260;
export const AUDIO_CARD_HEIGHT = 96;
/** Default size (in canvas px) of a text card. */
export const TEXT_CARD_WIDTH = 450;
export const TEXT_CARD_HEIGHT = 280;

/**
 * The board's active tool. "select" is the plain board — drag cards, pan, marquee.
 * The rest are offered on touch only (see [tool_controls]), each standing in for
 * something a finger can't land on the plain board: dragging out of a card's
 * corner node to link, right-clicking a 2.5px line to cut it, and finding the
 * 8px corner chevron that resizes a card.
 */
export type BoardTool = "select" | "link" | "cut" | "resize";
