import { describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import type { JSONContent } from "@tiptap/react";

import { ProjectState } from "@src/lib/project/project-state";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { FountainAdapter } from "@src/lib/adapters/fountain/fountain-adapter";

const toBuffer = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

const action = (id: string, text: string, pageBreak?: true) => ({
    type: "action",
    attrs: { "data-id": id, class: "action", ...(pageBreak ? { pageBreak: true } : {}) },
    content: [{ type: "text", text }],
});

const opts = { title: "T", projectAuthor: "A", includeNotes: true } as never;

describe("Fountain page breaks", () => {
    it("import: a === line sets pageBreak on the following block", () => {
        const fountain = ["!First action.", "", "===", "", "!After the break."].join("\n");
        const { screenplay } = new FountainAdapter().convertFrom(toBuffer(fountain));
        const nodes = screenplay as JSONContent[];

        expect(nodes).toHaveLength(2);
        expect(nodes[0].attrs?.pageBreak).toBeFalsy();
        expect(nodes[1].attrs?.pageBreak).toBe(true);
    });

    it("import: a trailing === with no following block is dropped (no crash)", () => {
        const fountain = ["!Only action.", "", "==="].join("\n");
        const { screenplay } = new FountainAdapter().convertFrom(toBuffer(fountain));
        const nodes = screenplay as JSONContent[];
        expect(nodes).toHaveLength(1);
        expect(nodes[0].attrs?.pageBreak).toBeFalsy();
    });

    it("export: a pageBreak block emits a standalone === line", async () => {
        const ydoc = new ProjectState();
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            { type: "doc", content: [action("a1", "Before"), action("a2", "After", true)] },
            ydoc.screenplayFragment(),
        );

        const blob = await new FountainAdapter().convertTo(ydoc, opts);
        const text = await blob.text();
        // A line that is exactly === (the Fountain page-break token).
        expect(text.split(/\r?\n/).some((l) => /^={3,}$/.test(l.trim()))).toBe(true);
        ydoc.destroy();
    });

    it("round-trips the pageBreak attribute through export then import", async () => {
        const ydoc = new ProjectState();
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            {
                type: "doc",
                content: [action("a1", "Before"), action("a2", "After", true), action("a3", "Tail")],
            },
            ydoc.screenplayFragment(),
        );

        const adapter = new FountainAdapter();
        const blob = await adapter.convertTo(ydoc, opts);
        const buffer = await blob.arrayBuffer();
        const { screenplay } = adapter.convertFrom(buffer);
        const nodes = screenplay as JSONContent[];

        const flat = (n: JSONContent) => (n.content ?? []).map((c) => c.text ?? "").join("");
        const broken = nodes.find((n) => n.attrs?.pageBreak === true);
        expect(broken).toBeDefined();
        expect(flat(broken!)).toBe("After");
        // The other blocks carry no break.
        expect(nodes.filter((n) => n.attrs?.pageBreak === true)).toHaveLength(1);
        ydoc.destroy();
    });
});
