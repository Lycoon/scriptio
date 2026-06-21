import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { ScriptioPagination, paginationKey } from "@src/lib/screenplay/extensions/pagination-extension";

const LINE = 16;

function injectStyle() {
    const id = "repro-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
        .ProseMirror > p, #pagination-test-div > p {
            display: block; width: 100%; line-height: ${LINE}px !important;
            margin-top: ${LINE}px; margin-bottom: 0; min-height: ${LINE}px;
            font-size: 12px; box-sizing: border-box; white-space: pre-wrap; padding: 0;
        }
        .ProseMirror > .pagination-page-break + p,
        .ProseMirror > .pagination-first-page + p { margin-top: 0 !important; }
    `;
    document.head.appendChild(s);
}

/** A handful of short Action lines — well under one page, so no NATURAL break
 *  ever occurs. Any break in these tests is therefore a manual one. */
async function makeEditor(n: number) {
    injectStyle();
    const el = document.createElement("div");
    document.body.appendChild(el);

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
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            ScriptioPagination.configure({
                pageHeight: 400,
                pageWidth: 600,
                marginTop: 0,
                marginBottom: 0,
                marginLeft: 0,
                marginRight: 0,
                pageGap: 10,
            }),
        ],
    });
    await new Promise((r) => setTimeout(r, 80));
    (editor.storage as unknown as Record<string, { fontsReady: boolean }>).Pagination.fontsReady = true;
    return editor;
}

type Break = { pos: number; manual?: boolean; anchorId?: string };

function breaksOf(editor: Editor): Break[] {
    const st = paginationKey.getState(editor.state) as { breaks: Break[] } | undefined;
    return st?.breaks ?? [];
}

/** Document position immediately before the i-th top-level node. */
function nodeStart(editor: Editor, index: number): number {
    let pos = -1;
    let i = 0;
    editor.state.doc.forEach((_node, p) => {
        if (i === index) pos = p;
        i++;
    });
    return pos;
}

describe("manual page break", () => {
    it("forces a break that begins at the flagged node", async () => {
        const editor = await makeEditor(5);
        expect(breaksOf(editor)).toHaveLength(0); // fits on one page, no natural break

        const target = nodeStart(editor, 2);
        editor.commands.toggleManualPageBreak(target);

        const breaks = breaksOf(editor);
        expect(breaks).toHaveLength(1);
        expect(breaks[0].pos).toBe(target);
        expect(breaks[0].manual).toBe(true);
        expect(breaks[0].anchorId).toBe("n2");
        // The widget carries the manual hint marker.
        expect((editor.view.dom as HTMLElement).querySelector(".pagination-manual-break")).not.toBeNull();
    });

    it("toggles back off, removing the break", async () => {
        const editor = await makeEditor(5);
        const target = nodeStart(editor, 2);

        editor.commands.toggleManualPageBreak(target);
        expect(breaksOf(editor)).toHaveLength(1);

        editor.commands.toggleManualPageBreak(target);
        expect(breaksOf(editor)).toHaveLength(0);
        expect((editor.view.dom as HTMLElement).querySelector(".pagination-manual-break")).toBeNull();
    });

    it("is a no-op on the first node (nothing to break before)", async () => {
        const editor = await makeEditor(5);
        editor.commands.toggleManualPageBreak(nodeStart(editor, 0));
        // Attribute is set, but pagination adds no break since the node already
        // starts page 1.
        expect(breaksOf(editor)).toHaveLength(0);
    });

    it("persists the flag as a node attribute", async () => {
        const editor = await makeEditor(5);
        const target = nodeStart(editor, 3);
        editor.commands.toggleManualPageBreak(target);
        expect(editor.state.doc.nodeAt(target)?.attrs.pageBreak).toBe(true);
    });
});
