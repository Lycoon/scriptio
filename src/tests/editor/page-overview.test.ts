import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";

import { BASE_EXTENSIONS, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { ScenarlyPagination, paginationKey } from "@src/lib/screenplay/extensions/pagination-extension";
import { readScriptPages } from "@src/lib/screenplay/page-overview";
import { largeDoc } from "../fixtures/screenplay-fixture";

/**
 * The page-overview view draws each page by slicing the document at the
 * pagination plugin's breaks and serializing that slice on its own — it never
 * copies the editor's DOM, which is parked (and so unmeasurable) while the view
 * is up.
 *
 * That rests on two things this file pins down. The ranges must tile the
 * document, or pages go missing or double; and every node the schema can hold
 * must have a renderHTML, or DOMSerializer throws and the whole wall goes
 * blank — which a node added with only a node view would silently cause.
 *
 * Needs real layout, since pagination measures rendered heights — so it runs in
 * Chromium and WebKit (see vitest.config.ts).
 */

const teardown: Array<() => void> = [];
afterEach(() => {
    while (teardown.length) teardown.pop()!();
});

/** A real script, paginated at the canonical Letter geometry. */
const mount = async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const editor = new Editor({
        element: el,
        injectCSS: false,
        autofocus: false,
        content: { type: "doc", content: largeDoc() },
        extensions: [
            ...BASE_EXTENSIONS,
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            ScenarlyPagination.configure({ ...SCREENPLAY_FORMATS.LETTER, pageGap: 20 }),
        ],
    });
    teardown.push(() => {
        editor.destroy();
        el.remove();
    });

    // Pagination measures heights off a real layout pass and skips the work
    // until the screenplay fonts report ready — the same gate the repro tests
    // open by hand.
    await new Promise((r) => setTimeout(r, 80));
    (editor.storage as unknown as Record<string, { fontsReady: boolean }>).Pagination.fontsReady = true;
    editor.view.dispatch(editor.state.tr.setMeta("forcePaginationUpdate", true));
    await new Promise((r) => setTimeout(r, 80));

    return editor;
};

const breakCount = (editor: Editor) =>
    ((paginationKey.getState(editor.state) as { breaks?: unknown[] } | undefined)?.breaks ?? []).length;

describe("page overview", () => {
    it("splits the script into one range per page, tiling the document", async () => {
        const editor = await mount();
        const pages = readScriptPages(editor);

        // A page per break, plus the page every document opens with.
        expect(pages).toHaveLength(breakCount(editor) + 1);
        // The fixture is a real screenplay, so this is a multi-page script — a
        // single page would make the tiling assertions below vacuous.
        expect(pages.length).toBeGreaterThan(1);

        expect(pages[0].from).toBe(0);
        expect(pages[pages.length - 1].to).toBe(editor.state.doc.content.size);
        for (let i = 1; i < pages.length; i++) {
            expect(pages[i].from).toBe(pages[i - 1].to);
        }
    });

    it("gives every page a caret position inside the document", async () => {
        const editor = await mount();
        const size = editor.state.doc.content.size;

        for (const page of readScriptPages(editor)) {
            expect(page.caret).toBeGreaterThanOrEqual(1);
            expect(page.caret).toBeLessThan(size);
            // The caret opens the page it belongs to, not the one before it.
            expect(page.caret).toBeGreaterThanOrEqual(page.from);
        }
    });

    it("serializes every page slice to DOM", async () => {
        const editor = await mount();
        const serializer = DOMSerializer.fromSchema(editor.schema);
        const pages = readScriptPages(editor);

        let rendered = 0;
        for (const page of pages) {
            const fragment = serializer.serializeFragment(editor.state.doc.slice(page.from, page.to).content);
            rendered += fragment.childElementCount;
        }

        // Every block in the script lands on exactly one page, so the pages
        // together render at least as many elements as the document has
        // top-level nodes (a node straddling a break contributes to both).
        expect(rendered).toBeGreaterThanOrEqual(editor.state.doc.childCount);
    });

    it("leaves the pages before an edit unchanged, so they need no redraw", async () => {
        const editor = await mount();
        const sliceAll = () => readScriptPages(editor).map((p) => editor.state.doc.slice(p.from, p.to).content);

        const before = sliceAll();
        const editedIndex = Math.floor(before.length / 2);
        const target = readScriptPages(editor)[editedIndex];

        // A collaborator types a character halfway through the script.
        editor.chain().insertContentAt(target.caret, "X").run();
        await new Promise((r) => setTimeout(r, 120));

        const after = sliceAll();

        // Every page ahead of the edit still holds the very same nodes, which is
        // what lets a thumbnail skip its serialize and relayout: ProseMirror
        // preserves node identity across a transaction, so Fragment.eq settles
        // these on pointer equality. Without this, one keystroke anywhere would
        // cost a full redraw of every page on screen.
        let unchanged = 0;
        for (let i = 0; i < editedIndex; i++) {
            if (after[i]?.eq(before[i])) unchanged++;
        }
        expect(unchanged).toBe(editedIndex);

        // …and the edited page itself did change, so the count above is not
        // passing because nothing happened.
        expect(after[editedIndex]?.eq(before[editedIndex])).toBe(false);
    });

    it("labels page one and numbers the rest in order", async () => {
        const editor = await mount();
        const pages = readScriptPages(editor);

        expect(pages[0].label).toBe("1");
        // Unlocked, the labels are the plain page numbers.
        expect(pages.map((p) => p.label)).toEqual(pages.map((_, i) => String(i + 1)));
    });
});
