import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ProjectData, ProjectState, screenplayOf, titlepageOf } from "@src/lib/project/project-state";
import type { JSONContent } from "@tiptap/core";

// ─── Formatted text (.txt) ───────────────────────────────────────────────────
//
// A plain-text rendering of the screenplay: no markup, no metadata, just the
// script laid out with spaces so it reads like a script in any text viewer.
//
// The layout is FIXED — it deliberately ignores the project's own margin /
// page-format settings. Column positions are the standard US screenplay
// measures at 12pt Courier (10 characters per inch), shifted so the action
// margin (1.5" from the paper edge) sits at column 0: a .txt file has no
// paper, so indenting every single line by a further 15 spaces would only
// waste width. Relative measures are preserved:
//
//     col 0        action / scene heading / section        (1.5")
//     col 10       dialogue                                (2.5")
//     col 15       parenthetical                           (3.0")
//     col 22       character cue                           (3.7")
//     col 60       right edge (transitions are flushed here) (7.5")

export type TextExportOptions = BaseExportOptions & {
    /** Render the title page ahead of the script. Defaults to true when omitted. */
    includeTitlePage?: boolean;
};

/** Width of the text column, in characters (7.5" − 1.5" at 10 cpi). */
const PAGE_WIDTH = 60;

type Layout = {
    indent: number;
    width: number;
    /** Flush the block against the right edge of the page instead of the indent. */
    rightAlign?: boolean;
};

const LAYOUTS: Record<string, Layout> = {
    scene: { indent: 0, width: PAGE_WIDTH },
    action: { indent: 0, width: PAGE_WIDTH },
    section: { indent: 0, width: PAGE_WIDTH },
    note: { indent: 0, width: PAGE_WIDTH },
    dialogue: { indent: 10, width: 35 },
    parenthetical: { indent: 15, width: 25 },
    character: { indent: 22, width: 38 },
    transition: { indent: 0, width: PAGE_WIDTH, rightAlign: true },
};

/** Gutter between the two columns of a dual dialogue, in characters. */
const DUAL_GAP = 2;
/** Width of one dual-dialogue column — two columns plus the gutter fill the page. */
const DUAL_WIDTH = (PAGE_WIDTH - DUAL_GAP) / 2;

/** Same three block types as a normal speech, squeezed into one narrow column. */
const DUAL_LAYOUTS: Record<string, Layout> = {
    character: { indent: 8, width: DUAL_WIDTH - 8 },
    parenthetical: { indent: 4, width: DUAL_WIDTH - 6 },
    dialogue: { indent: 1, width: DUAL_WIDTH - 2 },
};

/**
 * Blocks that continue the speech started by a character cue. They follow the
 * previous block immediately, with no blank line in between.
 */
const SPEECH_BLOCKS = new Set(["dialogue", "parenthetical"]);

/** Windows-friendly line ending — the file is meant to be opened in any viewer. */
const EOL = "\r\n";

/** Form feed: the conventional plain-text page break, honoured by printers. */
const PAGE_BREAK = "\f";

const flatten = (content: JSONContent[] | undefined): string =>
    (content ?? []).map((child) => child.text ?? "").join("");

/**
 * Break `text` into lines of at most `width` characters on word boundaries.
 * Words longer than the column (a URL, a long unspaced string) are hard-split
 * rather than allowed to overflow the margin. Returns [] for blank text.
 */
const wrap = (text: string, width: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";

    for (let word of words) {
        while (word.length > width) {
            if (line) {
                lines.push(line);
                line = "";
            }
            lines.push(word.slice(0, width));
            word = word.slice(width);
        }

        if (!line) line = word;
        else if (line.length + 1 + word.length <= width) line += " " + word;
        else {
            lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);
    return lines;
};

/** Wrap `text` and pad every resulting line to its column position. */
const layoutText = (text: string, layout: Layout): string[] =>
    wrap(text, layout.width).map((line) =>
        layout.rightAlign
            ? " ".repeat(Math.max(0, PAGE_WIDTH - line.length)) + line
            : " ".repeat(layout.indent) + line,
    );

/** The text of a block as it is printed: uppercased cues, wrapped parentheticals. */
const printableText = (type: string, text: string): string => {
    switch (type) {
        case "scene":
        case "character":
        case "section":
            return text.toUpperCase();
        case "transition":
            return text.toUpperCase().endsWith(":") ? text.toUpperCase() : text.toUpperCase() + ":";
        case "parenthetical":
            return text.startsWith("(") && text.endsWith(")") ? text : `(${text})`;
        case "note":
            return `[[${text}]]`;
        default:
            return text;
    }
};

/** The character cue a dual-dialogue column belongs to, or "" when it has none. */
const columnCharacter = (column: JSONContent): string => {
    const cue = (column.content ?? []).find((node) => node.attrs?.class === "character");
    return cue ? flatten(cue.content) : "";
};

/** Pad `line` to `width` characters so the next column starts at a fixed offset. */
const padTo = (line: string, width: number): string =>
    line.length >= width ? line : line + " ".repeat(width - line.length);

export class FormattedTextAdapter extends ProjectAdapter<TextExportOptions> {
    label = "Formatted Text";
    extension = "txt";

    convertTo(project: ProjectState, options: TextExportOptions): Promise<Blob> {
        const lines: string[] = [];

        const titlePage = (options.includeTitlePage ?? true) ? this.buildTitlePage(project, options) : [];
        if (titlePage.length > 0) {
            lines.push(...titlePage, PAGE_BREAK);
        }

        const nodes = screenplayOf(project);
        const characters = options.characters;
        // Type of the previous printed block — drives the blank line between
        // blocks (a speech stays glued together, a scene heading gets air).
        let previousType: string | undefined;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const type: string = node.attrs?.class ?? node.type;

            if (type === "note" && !options.includeNotes) continue;

            let blockLines: string[];

            if (node.type === "dual_dialogue") {
                blockLines = this.layoutDualDialogue(node, options);
            } else {
                const text = flatten(node.content);
                // Skip empty blocks: spacing between blocks is derived from
                // their types, so a blank paragraph would only add noise.
                if (!text.trim()) continue;

                // Don't export unselected characters — the cue and everything
                // it says (parentheticals and dialogue) are dropped together.
                if (type === "character" && characters && !characters.includes(text)) {
                    let j = i + 1;
                    while (j < nodes.length && SPEECH_BLOCKS.has(nodes[j].attrs?.class)) j++;
                    i = j - 1;
                    continue;
                }

                const layout = LAYOUTS[type] ?? LAYOUTS.action;
                blockLines = layoutText(printableText(type, text), layout);
            }

            if (blockLines.length === 0) continue;

            if (node.attrs?.pageBreak) {
                lines.push(PAGE_BREAK);
            } else if (previousType !== undefined) {
                lines.push(...this.separator(previousType, type));
            }

            lines.push(...blockLines);
            previousType = type;
        }

        const blob = new Blob([lines.join(EOL) + EOL], { type: "text/plain;charset=utf-8" });
        return Promise.resolve(blob);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    convertFrom(_: ArrayBuffer): Partial<ProjectData> {
        // Formatted text is a rendering, not a source format: the indentation
        // is ambiguous enough that `.txt` files are imported as Fountain.
        throw new Error("Import from formatted text is not supported");
    }

    /** The blank lines that go between a block of `previous` type and one of `next`. */
    private separator(previous: string, next: string): string[] {
        if (next === "scene" || next === "section") return ["", ""];

        // A speech is one visual unit: the cue, its parentheticals and its
        // dialogue run together with no blank line between them.
        if (SPEECH_BLOCKS.has(next) && (previous === "character" || SPEECH_BLOCKS.has(previous))) {
            // Two dialogue blocks in a row are separate paragraphs of the same
            // speech, and those do keep their blank line.
            return previous === "dialogue" && next === "dialogue" ? [""] : [];
        }

        return [""];
    }

    /**
     * Lay a dual dialogue out as two side-by-side columns, one per speaker, so
     * the simultaneity survives in plain text. Rows are padded to a fixed width
     * and the shorter column simply runs out of lines.
     */
    private layoutDualDialogue(node: JSONContent, options: BaseExportOptions): string[] {
        const characters = options.characters;
        const columns = (node.content ?? []).filter(
            (column) => !characters || characters.includes(columnCharacter(column)),
        );

        if (columns.length === 0) return [];

        // Only one speaker survived the character filter — print it as a
        // regular full-width speech rather than half a table.
        if (columns.length === 1) {
            return (columns[0].content ?? []).flatMap((child) => this.layoutSpeechBlock(child, LAYOUTS));
        }

        const [left, right] = columns.map((column) =>
            (column.content ?? []).flatMap((child) => this.layoutSpeechBlock(child, DUAL_LAYOUTS)),
        );

        const rows = Math.max(left.length, right.length);
        const merged: string[] = [];

        for (let row = 0; row < rows; row++) {
            const leftLine = left[row] ?? "";
            const rightLine = right[row] ?? "";
            merged.push((padTo(leftLine, DUAL_WIDTH + DUAL_GAP) + rightLine).trimEnd());
        }

        return merged;
    }

    /** Lay out one block of a dialogue column with the given set of layouts. */
    private layoutSpeechBlock(child: JSONContent, layouts: Record<string, Layout>): string[] {
        const type: string = child.attrs?.class ?? child.type ?? "dialogue";
        const text = flatten(child.content);
        if (!text.trim()) return [];
        return layoutText(printableText(type, text), layouts[type] ?? layouts.dialogue);
    }

    /**
     * Render the title page document, centred/aligned within the text column.
     * The `tp-title` / `tp-author` / `tp-date` atoms carry no text of their own
     * (the editor expands them from project metadata), so they are resolved
     * from the export options here.
     */
    private buildTitlePage(project: ProjectState, options: BaseExportOptions): string[] {
        const content = titlepageOf(project);
        if (!content || content.length === 0) return [];

        const lines: string[] = [];

        for (const node of content) {
            const text = (node.content ?? [])
                .map((child) => child.text ?? this.resolveTitlePageAtom(child.type, options))
                .join("")
                .trim();

            if (!text) {
                lines.push("");
                continue;
            }

            const align = node.attrs?.textAlign;
            for (const line of wrap(text, PAGE_WIDTH)) {
                if (align === "center") {
                    lines.push(" ".repeat(Math.floor((PAGE_WIDTH - line.length) / 2)) + line);
                } else if (align === "right") {
                    lines.push(" ".repeat(PAGE_WIDTH - line.length) + line);
                } else {
                    lines.push(line);
                }
            }
        }

        // Drop the leading/trailing blank lines of an otherwise empty page.
        while (lines.length > 0 && !lines[0].trim()) lines.shift();
        while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

        return lines;
    }

    /** Expand a title page format atom to the value it displays. */
    private resolveTitlePageAtom(type: string | undefined, options: BaseExportOptions): string {
        switch (type) {
            case "tp-title":
                return options.title || "";
            case "tp-author":
                return options.projectAuthor || "";
            case "tp-date":
                return new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
            default:
                return "";
        }
    }
}
