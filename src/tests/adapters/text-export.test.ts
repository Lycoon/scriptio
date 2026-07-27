import { describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import type { JSONContent } from "@tiptap/react";

import { ProjectState } from "@src/lib/project/project-state";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { TitlePageSchema } from "@src/lib/titlepage/editor";
import { FormattedTextAdapter, type TextExportOptions } from "@src/lib/adapters/text/text-adapter";

let nextId = 0;
const block = (type: string, text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
    type,
    attrs: { "data-id": `n${nextId++}`, class: type, ...attrs },
    content: text ? [{ type: "text", text }] : undefined,
});

const column = (...nodes: JSONContent[]): JSONContent => ({ type: "dual_dialogue_column", content: nodes });

const tpLine = (content: JSONContent[], align: string): JSONContent => ({
    type: "tp-text",
    attrs: { textAlign: align },
    content,
});

const titlePage: JSONContent[] = [
    tpLine([{ type: "tp-title" }], "center"),
    tpLine([{ type: "text", text: "Written by " }, { type: "tp-author" }], "center"),
];

const opts: TextExportOptions = { title: "T", author: "a@b.c", projectAuthor: "A", includeNotes: false };

/** Export `nodes` (plus an optional title page) and return the lines of the file. */
const exportLines = async (
    nodes: JSONContent[],
    options: TextExportOptions = opts,
    titlepage?: JSONContent[],
): Promise<string[]> => {
    const ydoc = new ProjectState();
    prosemirrorJSONToYXmlFragment(
        ScreenplaySchema,
        { type: "doc", content: nodes },
        ydoc.screenplayFragment(),
    );
    if (titlepage) {
        prosemirrorJSONToYXmlFragment(
            TitlePageSchema,
            { type: "doc", content: titlepage },
            ydoc.titlepageFragment(),
        );
    }

    const blob = await new FormattedTextAdapter().convertTo(ydoc, options);
    const text = await blob.text();
    ydoc.destroy();
    return text.split("\r\n");
};

/** Column the first non-space character of `line` sits at, or -1 for a blank line. */
const indentOf = (line: string) => line.search(/\S/);

describe("Formatted text export", () => {
    it("places each element at its standard margin", async () => {
        const lines = await exportLines([
            block("scene", "int. house - day"),
            block("action", "Jane walks in."),
            block("character", "jane"),
            block("parenthetical", "softly"),
            block("dialogue", "Hello."),
            block("transition", "cut to"),
        ]);

        const find = (needle: string) => lines.find((l) => l.includes(needle))!;

        expect(find("INT. HOUSE")).toBe("INT. HOUSE - DAY");
        expect(indentOf(find("Jane walks in."))).toBe(0);
        expect(indentOf(find("JANE"))).toBe(22);
        expect(find("softly").trim()).toBe("(softly)");
        expect(indentOf(find("softly"))).toBe(15);
        expect(indentOf(find("Hello."))).toBe(10);
        // Transitions are flushed against the right edge of the text column.
        expect(find("CUT TO")).toBe(" ".repeat(53) + "CUT TO:");
    });

    it("keeps a speech together and separates other blocks with a blank line", async () => {
        const lines = await exportLines([
            block("action", "Jane walks in."),
            block("character", "JANE"),
            block("parenthetical", "softly"),
            block("dialogue", "Hello."),
            block("dialogue", "Anyone home?"),
            block("action", "Silence."),
        ]);

        expect(lines.slice(0, 9)).toEqual([
            "Jane walks in.",
            "",
            " ".repeat(22) + "JANE",
            " ".repeat(15) + "(softly)",
            " ".repeat(10) + "Hello.",
            "",
            " ".repeat(10) + "Anyone home?",
            "",
            "Silence.",
        ]);
    });

    it("wraps text inside its column instead of overflowing", async () => {
        const long = "word ".repeat(60).trim();
        const lines = await exportLines([block("action", long), block("dialogue", long)]);

        const action = lines.filter((l) => l.startsWith("word"));
        const dialogue = lines.filter((l) => l.startsWith(" ".repeat(10) + "word"));

        expect(action.length).toBeGreaterThan(1);
        expect(dialogue.length).toBeGreaterThan(1);
        // 60-char text column for action, 35 for dialogue (both at 10 cpi).
        expect(Math.max(...action.map((l) => l.length))).toBeLessThanOrEqual(60);
        expect(Math.max(...dialogue.map((l) => l.length))).toBeLessThanOrEqual(45);
        // Nothing ever runs past the page width.
        expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(60);
    });

    it("honours the notes and characters options", async () => {
        const nodes = [
            block("note", "Rewrite this."),
            block("character", "JANE"),
            block("dialogue", "Mine."),
            block("character", "JOHN"),
            block("parenthetical", "flatly"),
            block("dialogue", "Not mine."),
        ];

        const withoutNotes = (await exportLines(nodes)).join("\n");
        expect(withoutNotes).not.toContain("Rewrite this.");

        const withNotes = (await exportLines(nodes, { ...opts, includeNotes: true })).join("\n");
        expect(withNotes).toContain("[[Rewrite this.]]");

        const onlyJane = (await exportLines(nodes, { ...opts, characters: ["JANE"] })).join("\n");
        expect(onlyJane).toContain("Mine.");
        expect(onlyJane).not.toContain("JOHN");
        expect(onlyJane).not.toContain("flatly");
        expect(onlyJane).not.toContain("Not mine.");
    });

    it("emits a form feed for a manual page break", async () => {
        const lines = await exportLines([
            block("action", "Before."),
            block("action", "After.", { pageBreak: true }),
        ]);

        expect(lines).toEqual(["Before.", "\f", "After.", ""]);
    });

    it("lays a dual dialogue out as two side-by-side columns", async () => {
        const lines = await exportLines([
            {
                type: "dual_dialogue",
                content: [
                    column(block("character", "JANE"), block("dialogue", "Left side.")),
                    column(block("character", "JOHN"), block("dialogue", "Right side.")),
                ],
            },
        ]);

        const cues = lines.find((l) => l.includes("JANE"))!;
        expect(cues).toContain("JOHN");
        // The right column starts halfway across the page.
        expect(cues.indexOf("JOHN")).toBeGreaterThanOrEqual(30);
        expect(lines.find((l) => l.includes("Left side."))).toContain("Right side.");
    });

    it("renders the title page above a page break", async () => {
        const lines = await exportLines([block("action", "Jane walks in.")], opts, titlePage);

        expect(lines[0].trim()).toBe("T");
        expect(indentOf(lines[0])).toBeGreaterThan(0); // centred
        expect(lines[1].trim()).toBe("Written by A");
        expect(lines[2]).toBe("\f");
        expect(lines[3]).toBe("Jane walks in.");
    });

    it("drops the title page when the option is off", async () => {
        const lines = await exportLines(
            [block("action", "Jane walks in.")],
            { ...opts, includeTitlePage: false },
            titlePage,
        );

        expect(lines).toEqual(["Jane walks in.", ""]);
    });
});
