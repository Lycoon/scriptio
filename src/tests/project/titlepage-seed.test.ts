import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import type { JSONContent } from "@tiptap/react";

import { ProjectState, titlepageOf } from "@src/lib/project/project-state";
import { TitlePageSchema, DEFAULT_TITLEPAGE_CONTENT } from "@src/lib/titlepage/editor";
import { seedTitlePage, titlePageSeedUpdate } from "@src/lib/titlepage/titlepage-seed";

/** Sync two docs both ways, as the cloud provider does on (re)connect. */
const sync = (a: ProjectState, b: ProjectState): void => {
    const updateA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
    const updateB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(b, updateA);
    Y.applyUpdate(a, updateB);
};

/**
 * Compact projection of title-page lines — `align:content`, with format atoms
 * as `{name}`. Compared against the same projection of the source template, so
 * the assertion covers the Yjs round-trip without pinning schema defaults.
 */
const outline = (lines: JSONContent[]): string[] =>
    lines.map(
        (line) =>
            `${line.attrs?.textAlign}:` +
            (line.content ?? []).map((node) => (node.type === "text" ? node.text : `{${node.type}}`)).join(""),
    );

const titlePageOutline = (ydoc: ProjectState): string[] => outline(titlepageOf(ydoc));

const TEMPLATE_OUTLINE = outline(DEFAULT_TITLEPAGE_CONTENT);

/** How many times the template's "by" line appears — one per seeded copy. */
const templateCopies = (ydoc: ProjectState): number =>
    titlePageOutline(ydoc).filter((line) => line === "center:by").length;

describe("title page seeding", () => {
    it("fills an empty title page with the default template", () => {
        const ydoc = new ProjectState();
        expect(seedTitlePage(ydoc)).toBe(true);
        expect(titlePageOutline(ydoc)).toEqual(TEMPLATE_OUTLINE);
    });

    it("seeds the fragment the project doc actually reads from", () => {
        // Guards TITLEPAGE_ROOT against a rename of ProjectState.KEYS.TITLEPAGE.
        const ydoc = new ProjectState();
        seedTitlePage(ydoc);
        expect(ydoc.titlepageFragment().length).toBe(DEFAULT_TITLEPAGE_CONTENT.length);
    });

    it("no-ops on a title page that already has content", () => {
        const ydoc = new ProjectState();
        prosemirrorJSONToYXmlFragment(
            TitlePageSchema,
            {
                type: "doc",
                content: [{ type: "tp-text", attrs: { textAlign: "left" }, content: [{ type: "text", text: "mine" }] }],
            },
            ydoc.titlepageFragment(),
        );
        expect(seedTitlePage(ydoc)).toBe(false);
        expect(titlePageOutline(ydoc)).toEqual(["left:mine"]);
    });

    it("is idempotent when applied twice to the same doc", () => {
        const ydoc = new ProjectState();
        seedTitlePage(ydoc);
        Y.applyUpdate(ydoc, titlePageSeedUpdate());
        expect(templateCopies(ydoc)).toBe(1);
        expect(titlePageOutline(ydoc)).toEqual(TEMPLATE_OUTLINE);
    });

    it("converges to a single copy when two clients seed concurrently", () => {
        const a = new ProjectState();
        const b = new ProjectState();
        seedTitlePage(a);
        seedTitlePage(b);
        sync(a, b);

        expect(templateCopies(a)).toBe(1);
        expect(titlePageOutline(a)).toEqual(TEMPLATE_OUTLINE);
        expect(titlePageOutline(b)).toEqual(titlePageOutline(a));
    });

    it("does not resurrect a template the peer has already edited away", () => {
        // A seeds and trims the template down; B seeds from an empty doc (fresh
        // device that hasn't synced yet); then the two meet.
        const a = new ProjectState();
        seedTitlePage(a);
        const fragment = a.titlepageFragment();
        fragment.delete(0, fragment.length - 1);

        const b = new ProjectState();
        seedTitlePage(b);
        sync(a, b);

        expect(templateCopies(a)).toBe(0);
        expect(titlePageOutline(a)).toHaveLength(1);
        expect(titlePageOutline(b)).toEqual(titlePageOutline(a));
    });

    it("drops the title's underline mark, as any Yjs write does", () => {
        // y-prosemirror stores marks as Y.Text formatting, so marks on inline
        // atom nodes (tp-title/tp-author/tp-date) are lost on the way into the
        // doc — the template's underline never survived a reload either.
        const ydoc = new ProjectState();
        seedTitlePage(ydoc);
        const title = titlepageOf(ydoc)
            .flatMap((line) => line.content ?? [])
            .find((node) => node.type === "tp-title");
        expect(title).toBeDefined();
        expect(title?.marks).toBeUndefined();
    });
});
