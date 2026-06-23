import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import * as fflate from "fflate";

import { WriterSoloAdapter } from "@src/lib/adapters/writersolo/writersolo-adapter";
import { ProjectState, titlepageOf } from "@src/lib/project/project-state";
import { TitlePageSchema } from "@src/lib/titlepage/editor";

// WriterDuet wraps styled runs in paired control characters.
const wrap = (open: number, close: number, s: string) =>
    String.fromCharCode(open) + s + String.fromCharCode(close);
const bold = (s: string) => wrap(1, 2, s);
const underline = (s: string) => wrap(5, 6, s);

/** A line as stored after replay: text is a single OT insert change-set. */
const line = (type: string, text: string, extra: Record<string, unknown> = {}) => ({
    type,
    content: { c1: [0, [["i", [1, "", 0, text]]], 1] },
    ...extra,
});

/** Wrap a WriterSolo document object into a `.wdz` ZIP buffer. */
const toWdz = (doc: unknown): ArrayBuffer => {
    const zip = fflate.zipSync({ "script.json": fflate.strToU8(JSON.stringify(doc)) });
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
};

// Body lines keyed so a lexicographic sort yields reading order.
const bodyLines = {
    a0: line("Slugline", "INT. HOUSE - DAY"),
    a1: line("Action", `${bold("FADE IN:")} then normal.`),
    a2: line("EditDialogName", "JANE"),
    a3: line("EditDialogParen", "(softly)"),
    a4: line("EditDialogContent", `Hello ${underline("world")}.`),
    a5: line("Transition", "CUT TO:"),
};

const DOC = {
    b: {
        "-": {
            h: {
                // snapshot, batch update (a:"u"), then a granular leaf set.
                "-": { a: "s", l: "", v: JSON.stringify({ data: {} }) },
                op1: { a: "u", l: "data", v: JSON.stringify(bodyLines) },
                op2: { l: "data/a5/pb", v: "1" }, // page break before the transition
            },
        },
        titlePage: {
            h: {
                "-": { a: "s", l: "", v: JSON.stringify({ data: {} }) },
                t1: {
                    a: "u",
                    l: "data",
                    v: JSON.stringify({
                        z0: line("Title", "BIG FISH", { al: "center" }),
                        z1: line("Text", ""),
                    }),
                },
            },
        },
    },
};

describe("WriterSolo adapter import", () => {
    const { screenplay, titlepage } = new WriterSoloAdapter().convertFrom(toWdz(DOC));
    const nodes = screenplay as JSONContent[];

    it("replays the oplog and maps line types in reading order", () => {
        expect(nodes.map((n) => n.type)).toEqual([
            "scene",
            "action",
            "character",
            "parenthetical",
            "dialogue",
            "transition",
        ]);
        expect(nodes.every((n) => n.attrs?.class === n.type)).toBe(true);
    });

    it("decodes inline bold control characters into a mark, splitting runs", () => {
        expect(nodes[1].content).toEqual([
            { type: "text", text: "FADE IN:", marks: [{ type: "bold" }] },
            { type: "text", text: " then normal." },
        ]);
    });

    it("decodes inline underline control characters mid-run", () => {
        expect(nodes[4].content).toEqual([
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "underline" }] },
            { type: "text", text: "." },
        ]);
    });

    it("applies a granular leaf-set op (pb) as a page break", () => {
        expect(nodes[5].attrs?.pageBreak).toBe(true);
        expect(nodes[0].attrs?.pageBreak).toBeFalsy();
    });

    it("imports the title page as tp-text lines, with alignment and blank lines", () => {
        const tp = titlepage as JSONContent[];
        expect(tp).toHaveLength(2);
        // Title page lines must be the title-page schema node, not screenplay nodes.
        expect(tp.every((n) => n.type === "tp-text")).toBe(true);
        expect(tp[0].attrs?.textAlign).toBe("center");
        expect(tp[0].content?.[0].text).toBe("BIG FISH");
        expect(tp[1].content).toEqual([]);
    });

    it("title page survives the title-page Yjs fragment round-trip (the import path)", () => {
        // applyProjectData writes the title page through TitlePageSchema; screenplay
        // nodes would be rejected here. This proves the emitted nodes are valid.
        const ydoc = new ProjectState();
        prosemirrorJSONToYXmlFragment(
            TitlePageSchema,
            { type: "doc", content: titlepage as JSONContent[] },
            ydoc.titlepageFragment(),
        );
        const back = titlepageOf(ydoc);
        expect(back).toHaveLength(2);
        expect(back[0].content?.[0].text).toBe("BIG FISH");
        ydoc.destroy();
    });

    it("throws a clear error when script.json is missing", () => {
        const zip = fflate.zipSync({ "other.txt": fflate.strToU8("x") });
        const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
        expect(() => new WriterSoloAdapter().convertFrom(buffer)).toThrow(/script\.json/);
    });
});

describe("WriterSolo text reconstruction (content + .c)", () => {
    // A line whose text lives only in `.c` (created granularly, like the first
    // line of a real document) and a line that was edited after creation: its
    // original `content` ("Untitled") composes with `.c` delete/insert ops into
    // "Big Fish" — mirroring the real title-page Title line.
    const editLines = {
        a0: {
            type: "Action",
            ".c": { e0: [1, [["i", [1, "", 0, "Opening narration."]]], 100] },
        },
        a1: {
            type: "Slugline",
            content: { o1: [0, [["i", [0, "", 0, "Untitled"]]], 10] },
            ".c": {
                e1: [9, [["d", [9, "ctx", 0, 3]]], 20], // "Untitled" → "itled"
                e2: [9, [["i", [9, "ctx", 0, "B"]]], 21], // → "Bitled"
                e3: [9, [["d", [9, "ctx", 2, 4]]], 22], // → "Bi"
                e4: [9, [["i", [9, "ctx", 2, "g Fish"]]], 23], // → "Big Fish"
            },
        },
    };

    const doc = {
        b: {
            "-": {
                h: {
                    "-": { a: "s", l: "", v: JSON.stringify({ data: {} }) },
                    op1: { a: "u", l: "data", v: JSON.stringify(editLines) },
                },
            },
        },
    };

    const { screenplay } = new WriterSoloAdapter().convertFrom(toWdz(doc));
    const nodes = screenplay as JSONContent[];

    it("reconstructs text stored only in .c", () => {
        expect(nodes[0].content?.[0].text).toBe("Opening narration.");
    });

    it("composes content with .c edits (insert/delete) into the final text", () => {
        expect(nodes[1].content?.[0].text).toBe("Big Fish");
    });
});
