import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createRevisionsExtension, refreshRevisions } from "@src/lib/screenplay/extensions/revisions-extension";

/**
 * Regression guard for hiding the revision overlay ("No revision" in the
 * production panel).
 *
 * The overlay's stripes/asterisks are absolutely-positioned children of a
 * zero-sized container, most of them outside its box. Clearing the overlay by
 * dropping its widget decoration therefore removed a 0×0 element whose repaint
 * rect doesn't span its children: WebKit never invalidated the area they
 * covered, so on Safari every stripe the viewport had already painted stayed on
 * screen (pages that were never painted — the renderer is viewport-culled —
 * correctly showed none). The overlay must stay mounted and be emptied in
 * place, so each stripe's own removal repaints it.
 */

type RevState = { enabled: boolean; current: number; display: "all" | "hidden" | "current" };

function makeEditor(n: number) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const rev: RevState = { enabled: false, current: 0, display: "all" };

    const content: object[] = [];
    for (let i = 0; i < n; i++) {
        content.push({
            type: "action",
            attrs: { "data-id": `n${i}`, class: "action" },
            content: [{ type: "text", text: `L${i}` }],
        });
    }

    const editor = new Editor({
        element: el,
        injectCSS: false,
        autofocus: false,
        content: { type: "doc", content },
        extensions: [
            ...BASE_EXTENSIONS,
            createRevisionsExtension({
                getRevisionsEnabled: () => rev.enabled,
                getCurrentRevision: () => rev.current,
                getDisplayMode: () => rev.display,
            }),
        ],
    });

    // The overlay renderer reads its page geometry from these (normally set by
    // the pagination extension); without them it bails out and paints nothing.
    const dom = editor.view.dom as HTMLElement;
    dom.style.setProperty("--page-height", "1000px");
    dom.style.setProperty("--page-gap", "20px");
    dom.style.setProperty("--page-width", "800px");
    dom.style.setProperty("--page-margin-right", "100px");
    dom.style.setProperty("--page-margin-top", "0px");
    dom.style.setProperty("--page-margin-bottom", "0px");
    dom.style.setProperty("--line-height", "16px");
    return { editor, rev, el };
}

/** Revision stamping is debounced (FLUSH_DELAY = 220ms). */
const settle = () => new Promise((r) => setTimeout(r, 320));
/** The overlay repaints on a coalesced rAF; two frames is past it. */
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

function insidePos(editor: Editor, index: number): number {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p + 1;
    });
    return pos;
}

const overlayOf = (el: HTMLElement) => el.querySelector(".revision-overlay") as HTMLElement | null;

describe("revisions overlay: hiding the display", () => {
    it("empties the overlay in place instead of detaching it", async () => {
        const { editor, rev, el } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;
        editor.chain().focus().insertContentAt(insidePos(editor, 2), "hello").run();
        await settle();
        refreshRevisions(editor);
        await frames();

        const overlay = overlayOf(el);
        expect(overlay).not.toBeNull();
        expect(overlay!.querySelectorAll(".revision-stripe").length).toBeGreaterThan(0);
        expect(overlay!.querySelectorAll(".revision-asterisk").length).toBeGreaterThan(0);

        rev.display = "hidden";
        refreshRevisions(editor);
        await frames();

        // Emptied…
        expect(overlay!.childElementCount).toBe(0);
        // …while still in the document: the stripes are removed one by one from
        // an attached parent, which is what makes WebKit repaint their area.
        expect(overlay!.isConnected).toBe(true);

        // And it comes back on re-show.
        rev.display = "all";
        refreshRevisions(editor);
        await frames();
        expect(overlay!.querySelectorAll(".revision-stripe").length).toBeGreaterThan(0);

        editor.destroy();
    });
});
