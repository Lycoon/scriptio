import { BoardCardData } from "@src/lib/project/project-state";
import { MAX_SCALE, MIN_SCALE } from "./board-constants";

export type CardSide = "top" | "right" | "bottom" | "left";

export type Point = { x: number; y: number };

/** Where a link meets a card: the midpoint of the given edge. */
export function getConnectionPoint(card: BoardCardData, side: CardSide): Point {
    const centerX = card.x + card.width / 2;
    const centerY = card.y + card.height / 2;

    switch (side) {
        case "top":
            return { x: centerX, y: card.y };
        case "right":
            return { x: card.x + card.width, y: centerY };
        case "bottom":
            return { x: centerX, y: card.y + card.height };
        case "left":
            return { x: card.x, y: centerY };
    }
}

/** Outward unit normal of an edge — the direction a link leaves the card in. */
export function getSideDirection(side: CardSide): Point {
    switch (side) {
        case "top":
            return { x: 0, y: -1 };
        case "right":
            return { x: 1, y: 0 };
        case "bottom":
            return { x: 0, y: 1 };
        case "left":
            return { x: -1, y: 0 };
    }
}

/** The edge a link should leave/enter through, given the direction it travels. */
function sideForDelta(dx: number, dy: number): { from: CardSide; to: CardSide } {
    if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal dominant
        return dx > 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
    }
    // Vertical dominant
    return dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

/** Best connection points between two cards, with their perpendicular tangents. */
export function getArrowPoints(fromCard: BoardCardData, toCard: BoardCardData) {
    const fromCenter = { x: fromCard.x + fromCard.width / 2, y: fromCard.y + fromCard.height / 2 };
    const toCenter = { x: toCard.x + toCard.width / 2, y: toCard.y + toCard.height / 2 };

    const { from: fromSide, to: toSide } = sideForDelta(
        toCenter.x - fromCenter.x,
        toCenter.y - fromCenter.y,
    );

    return {
        from: getConnectionPoint(fromCard, fromSide),
        to: getConnectionPoint(toCard, toSide),
        fromDir: getSideDirection(fromSide),
        toDir: getSideDirection(toSide),
    };
}

/** Arrowhead dimensions (canvas px); `ARROW_WIDTH` is a half-width. */
const ARROW_LENGTH = 24;
const ARROW_WIDTH = 8;

/**
 * The two paths that draw a link between cards: the bezier body and the
 * arrowhead at its end.
 *
 * The body stops at the arrowhead's inner notch rather than at the card edge,
 * so the stroke never pokes through the tip.
 */
export function buildArrowPath(fromCard: BoardCardData, toCard: BoardCardData) {
    const points = getArrowPoints(fromCard, toCard);

    // Control points extend perpendicular to the borders
    const dist = Math.hypot(points.to.x - points.from.x, points.to.y - points.from.y);
    const controlDist = Math.max(50, dist * 0.4);
    const cx1 = points.from.x + points.fromDir.x * controlDist;
    const cy1 = points.from.y + points.fromDir.y * controlDist;
    const cx2 = points.to.x + points.toDir.x * controlDist;
    const cy2 = points.to.y + points.toDir.y * controlDist;

    // Arrowhead angle comes from the curve's end tangent
    const angle = Math.atan2(points.to.y - cy2, points.to.x - cx2);

    // Back corners (perpendicular to arrow direction)
    const ax1 = points.to.x - ARROW_LENGTH * Math.cos(angle) + ARROW_WIDTH * Math.sin(angle);
    const ay1 = points.to.y - ARROW_LENGTH * Math.sin(angle) - ARROW_WIDTH * Math.cos(angle);
    const ax2 = points.to.x - ARROW_LENGTH * Math.cos(angle) - ARROW_WIDTH * Math.sin(angle);
    const ay2 = points.to.y - ARROW_LENGTH * Math.sin(angle) + ARROW_WIDTH * Math.cos(angle);
    // Inner notch (25% from back toward tip), where the line stops
    const notchDepth = ARROW_LENGTH * 0.75;
    const axm = points.to.x - notchDepth * Math.cos(angle);
    const aym = points.to.y - notchDepth * Math.sin(angle);

    return {
        pathD: `M ${points.from.x} ${points.from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${axm} ${aym}`,
        arrowheadD: `M ${ax1} ${ay1} L ${points.to.x} ${points.to.y} L ${ax2} ${ay2} L ${axm} ${aym} Z`,
    };
}

/**
 * The dashed line drawn while a link is being dragged out of a card, from the
 * edge facing the cursor to the cursor itself.
 */
export function buildConnectingPath(fromCard: BoardCardData, to: Point): string {
    const fromCenter = { x: fromCard.x + fromCard.width / 2, y: fromCard.y + fromCard.height / 2 };
    const { from: fromSide } = sideForDelta(to.x - fromCenter.x, to.y - fromCenter.y);
    const fromDir = getSideDirection(fromSide);
    const fromPoint = getConnectionPoint(fromCard, fromSide);

    const dist = Math.hypot(to.x - fromPoint.x, to.y - fromPoint.y);
    const controlDist = Math.max(30, dist * 0.3);
    const cx = fromPoint.x + fromDir.x * controlDist;
    const cy = fromPoint.y + fromDir.y * controlDist;

    return `M ${fromPoint.x} ${fromPoint.y} Q ${cx} ${cy}, ${to.x} ${to.y}`;
}

/** Padding (canvas px) left around the cards when fitting the camera to them. */
const FIT_PADDING = 100;

/**
 * Camera that frames every given card inside a viewport, clamped to the zoom
 * range. Returns null when there is nothing to frame.
 */
export function fitCameraToCards(
    cards: BoardCardData[],
    viewport: { width: number; height: number },
): { scale: number; offset: Point } | null {
    if (cards.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const card of cards) {
        minX = Math.min(minX, card.x);
        minY = Math.min(minY, card.y);
        maxX = Math.max(maxX, card.x + card.width);
        maxY = Math.max(maxY, card.y + card.height);
    }

    minX -= FIT_PADDING;
    minY -= FIT_PADDING;
    maxX += FIT_PADDING;
    maxY += FIT_PADDING;

    const boundsCenterX = (minX + maxX) / 2;
    const boundsCenterY = (minY + maxY) / 2;

    const scaleX = viewport.width / (maxX - minX);
    const scaleY = viewport.height / (maxY - minY);
    const scale = clampScale(Math.min(scaleX, scaleY));

    return {
        scale,
        offset: {
            x: viewport.width / 2 - boundsCenterX * scale,
            y: viewport.height / 2 - boundsCenterY * scale,
        },
    };
}

export function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Zoom about a fixed screen point: the canvas point under it stays put.
 * `anchor` is relative to the container's top-left.
 */
export function zoomAround(
    anchor: Point,
    camera: { offset: Point; scale: number },
    factor: number,
): { scale: number; offset: Point } {
    const newScale = clampScale(camera.scale * factor);
    const canvasX = (anchor.x - camera.offset.x) / camera.scale;
    const canvasY = (anchor.y - camera.offset.y) / camera.scale;
    return {
        scale: newScale,
        offset: { x: anchor.x - canvasX * newScale, y: anchor.y - canvasY * newScale },
    };
}
