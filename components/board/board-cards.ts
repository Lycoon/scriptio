import { BoardCardData } from "@src/lib/project/project-state";
import { DEFAULT_ITEM_COLORS } from "@src/lib/utils/colors";
import { v7 as uuidv7 } from "uuid";
import {
    AUDIO_CARD_HEIGHT,
    AUDIO_CARD_WIDTH,
    GRID_SIZE,
    MAX_IMAGE_CARD_SIZE,
    TEXT_CARD_HEIGHT,
    TEXT_CARD_WIDTH,
} from "./board-constants";

/** A random swatch from the default palette (used for new colored cards). */
export function randomCardColor(): string {
    return DEFAULT_ITEM_COLORS[Math.floor(Math.random() * DEFAULT_ITEM_COLORS.length)];
}

/** Round a canvas coordinate onto the grid, unless snapping is held off (Shift). */
export function snapToGrid(value: number, isSnapping: boolean): number {
    return isSnapping ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

export function createTextCard(x: number, y: number, isSnapping: boolean): BoardCardData {
    return {
        id: uuidv7(),
        title: "",
        description: "",
        color: randomCardColor(),
        x: snapToGrid(x, isSnapping),
        y: snapToGrid(y, isSnapping),
        width: TEXT_CARD_WIDTH,
        height: TEXT_CARD_HEIGHT,
    };
}

/**
 * An image card sized from the source image, scaled down to fit
 * MAX_IMAGE_CARD_SIZE on its longest edge (never up, so small images keep
 * their pixel size).
 */
export function createImageCard(
    assetId: string,
    imageWidth: number,
    imageHeight: number,
    x: number,
    y: number,
): BoardCardData {
    const fit = Math.min(1, MAX_IMAGE_CARD_SIZE / Math.max(imageWidth, imageHeight, 1));
    return {
        id: uuidv7(),
        type: "image",
        assetId,
        title: "",
        description: "",
        color: "transparent",
        x,
        y,
        width: Math.max(60, Math.round(imageWidth * fit)),
        height: Math.max(60, Math.round(imageHeight * fit)),
    };
}

export function createAudioCard(assetId: string, x: number, y: number): BoardCardData {
    return {
        id: uuidv7(),
        type: "audio",
        assetId,
        title: "",
        description: "",
        color: randomCardColor(),
        x,
        y,
        width: AUDIO_CARD_WIDTH,
        height: AUDIO_CARD_HEIGHT,
    };
}
