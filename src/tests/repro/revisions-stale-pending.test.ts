import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createRevisionsExtension, revisionsPluginKey } from "@src/lib/screenplay/extensions/revisions-extension";

/**
 * Regression guard for a duplicated revision asterisk.
 *
 * The overlay bridges the stamping debounce by painting the plugin's pending
 * (not-yet-committed) edits on top of the committed marks. That set is cleared
 * when the debounced stamp transaction lands — so a flush that had nothing to
 * write, and therefore dispatched nothing, left its pending edits behind
 * permanently. Deleting an empty line whose surviving neighbour is an empty
 * line already stamped at the current revision is exactly that case: the
 * deletion point sits between blocks (nothing to anchor) and the neighbour's
 * node attribute is already at the current revision, so the stamp is a no-op.
 * The stranded deletion point then painted a second asterisk on that line for
 * the rest of the session — until an edit on the line produced a stampable
 * change and finally cleared pending.
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

/** Document position of top-level child `index`. */
function startPos(editor: Editor, index: number): number {
    let pos = -1;
    editor.state.doc.forEach((node, p, i) => {
        if (i === index) pos = p;
    });
    return pos;
}

const asteriskCount = (el: HTMLElement) => el.querySelectorAll(".revision-asterisk").length;

describe("revisions overlay: deleting an empty line", () => {
    it("leaves a single asterisk on the line the cursor lands on", async () => {
        const { editor, rev, el } = makeEditor(6);
        rev.enabled = true;
        rev.current = 1;

        // Enter at the end of line 2 → empty line 3, stamped via its node attr.
        const end2 = startPos(editor, 2) + editor.state.doc.child(2).nodeSize - 1;
        editor.chain().focus().setTextSelection(end2).splitBlock().run();
        await settle();
        // Enter again on that empty line → empty lines 3 and 4, both stamped.
        editor
            .chain()
            .focus()
            .setTextSelection(startPos(editor, 3) + 1)
            .splitBlock()
            .run();
        await settle();
        await frames();
        expect(editor.state.doc.child(3).attrs.revision).toBe(1);
        expect(editor.state.doc.child(4).attrs.revision).toBe(1);

        // Backspace on the empty line 4: the node goes, the cursor lands on the
        // (already stamped) empty line 3 — a change the stamp can't write.
        editor
            .chain()
            .focus()
            .setTextSelection(startPos(editor, 4) + 1)
            .run();
        editor.commands.keyboardShortcut("Backspace");

        // Inside the debounce window: the pending preview must not add a second
        // asterisk. The deletion point lies BETWEEN blocks, where `coordsAtPos`
        // resolves to the neighbouring block's whole rect rather than to a line
        // — so previewing it painted an asterisk at that block's centre, half a
        // line off the committed one. (If the flush happened to land early this
        // still holds: pending is then cleared and only the committed mark is
        // painted.)
        await frames();
        expect(asteriskCount(el)).toBe(1);

        // Past the flush: it had nothing to write, but must still have consumed
        // the pending set — otherwise the deletion point lives on, mapped
        // forward and repainted for the rest of the session.
        await settle();
        await frames();
        expect(editor.state.doc.child(3).attrs.revision).toBe(1);
        expect(revisionsPluginKey.getState(editor.state)?.dirty).toBe(false);
        expect(revisionsPluginKey.getState(editor.state)?.del).toEqual([]);
        expect(asteriskCount(el)).toBe(1);

        editor.destroy();
    });
});
