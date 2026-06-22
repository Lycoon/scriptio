import type { JSONContent } from "@tiptap/core";

// Helpers for building imported title-page content. The title page editor uses
// its own schema (see `TitlePageSchema`): every line is a single `tp-text` block
// whose `textAlign` drives alignment, with inline text + marks inside. Importers
// must emit this shape — screenplay nodes (`action`, `scene`, …) are not valid in
// the title-page fragment and get dropped (or rejected by `prosemirrorJSONToYXmlFragment`).

/** The single block node type of the title page schema. */
export const TITLEPAGE_NODE = "tp-text";

export type TitlePageAlign = "left" | "center" | "right";

/** Normalize an arbitrary alignment value to a supported title page alignment. */
export const toTitlePageAlign = (value: unknown): TitlePageAlign =>
    value === "center" || value === "right" ? value : "left";

/** Build one title page line (a `tp-text` block) from inline content and alignment. */
export const titlePageLine = (content: JSONContent[], align: TitlePageAlign = "left"): JSONContent => ({
    type: TITLEPAGE_NODE,
    attrs: { textAlign: align },
    content,
});
