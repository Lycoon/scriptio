/**
 * Production revisions — shared primitives.
 *
 * A revision is identified by its **index** into {@link REVISION_COLORS}:
 *   0 = White  (the base draft — no visible marks)
 *   1 = Blue   (first issued revision)
 *   2 = Pink   …
 *
 * Each top-level screenplay node carries an optional `revision` attribute (the
 * index of the revision it was last edited under — see the `RevisionAttribute`
 * BASE extension). Marks are **cumulative**: a line keeps the colour of the last
 * revision that touched it, and advancing the current revision never clears
 * existing marks. The current revision (`currentRevision` in ProductionData)
 * only decides which colour new edits are stamped with.
 *
 * Names stay in English on purpose — they are the standard production revision
 * colour order and are surfaced verbatim in printed page headers.
 */

export interface RevisionColor {
    name: string;
    value: string;
}

export const REVISION_COLORS: RevisionColor[] = [
    { name: "White", value: "#ffffff" },
    { name: "Blue", value: "#2f74c0" },
    { name: "Pink", value: "#d6457a" },
    { name: "Yellow", value: "#bda700" },
    { name: "Green", value: "#52a256" },
    { name: "Goldenrod", value: "#bb8c14" },
    { name: "Buff", value: "#e0c58b" },
    { name: "Salmon", value: "#fa8072" },
    { name: "Cherry", value: "#9b1c2a" },
];

/** Index of the base (White) revision — never carries a visible mark. */
export const BASE_REVISION = 0;

/**
 * How committed revision marks are surfaced in the editor. Independent of the
 * "Revision mode" toggle (which only decides whether *new* edits are stamped):
 *  - `all`     — every revision's coloured ranges, asterisks and stripes show.
 *  - `hidden`  — nothing is shown (marks stay in the document, just untinted).
 *  - `current` — only the {@link RevisionColor} at `currentRevision` is shown.
 */
export type RevisionDisplayMode = "all" | "hidden" | "current";

/** Default display mode for a project (show everything). */
export const DEFAULT_REVISION_DISPLAY_MODE: RevisionDisplayMode = "all";

/**
 * Transaction meta set on the revision-stamping transaction (the appended tr
 * that writes the `revision` attr onto edited lines). Stamping only changes an
 * attribute — never layout — so the pagination plugin skips it exactly like it
 * skips `nodeDedupId`, avoiding a redundant second measure pass per keystroke.
 * Defined here (a dependency-free module) so both the pagination and revisions
 * extensions can import it without a cycle.
 */
export const REVISION_STAMP_META = "revisionStamp";

/** Clamp an arbitrary index into the colour list's bounds. */
export const clampRevision = (index: number): number => Math.max(0, Math.min(index, REVISION_COLORS.length - 1));

/** Hex colour for a revision index, or `undefined` for the base/out-of-range. */
export const revisionColor = (index: number | null | undefined): string | undefined => {
    if (index == null || index < 1 || index >= REVISION_COLORS.length) return undefined;
    return REVISION_COLORS[index].value;
};

/** Next revision index (the colour a draft-lock or "advance" moves to). Caps at the last colour. */
export const nextRevision = (index: number): number => clampRevision(index + 1);
