import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS, insertElement } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { ScriptioPagination, paginationKey } from "@src/lib/screenplay/extensions/pagination-extension";
import { ScreenplayElement } from "@src/lib/utils/enums";

/**
 * Regression guards for the editor's typing hot path.
 *
 * A mid-document Enter shifts every following page boundary, which makes
 * ProseMirror relocate (recreate) every downstream break widget — that part
 * is inherent to pagination. What these tests pin down:
 *
 *  1. Widget KEYS must stay stable when their rendered content is unchanged
 *     (lazy widgets are only cheap because matching keys reuse DOM). A key
 *     regression (e.g. putting `pos` back into the key) would silently
 *     resurrect the full-rebuild-per-keystroke storm.
 *  2. Enter at the end of the document (the common writing position) must
 *     cause only constant DOM churn, not O(pages).
 *  3. Break widgets must carry content-visibility so the relocated offscreen
 *     widgets skip style recalc + layout.
 */

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
                pageHeight: 200, pageWidth: 600, marginTop: 0, marginBottom: 0,
                marginLeft: 0, marginRight: 0, pageGap: 10,
                // The page-number header is an HTML template, not plain text.
                headerRight: `<p class="page-number">{page}.</p>`,
            }),
        ],
    });
    await new Promise((r) => setTimeout(r, 80));
    (editor.storage as unknown as Record<string, { fontsReady: boolean }>).Pagination.fontsReady = true;
    const tr = editor.state.tr;
    tr.setMeta("forcePaginationUpdate", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    return editor;
}

function breaksOf(editor: Editor) {
    const st = paginationKey.getState(editor.state) as { breaks: { pos: number }[] } | undefined;
    return st?.breaks ?? [];
}

function widgetKeysOf(editor: Editor) {
    const st = paginationKey.getState(editor.state) as {
        decset: { find: () => { spec: { key?: string } }[] };
    };
    return st.decset.find().map((d) => d.spec.key ?? "?");
}

/** Counts DOM nodes added/removed inside the editor during fn(). */
function churn(editor: Editor, fn: () => void) {
    let added = 0;
    let removed = 0;
    const obs = new MutationObserver((muts) => {
        for (const m of muts) {
            added += m.addedNodes.length;
            removed += m.removedNodes.length;
        }
    });
    obs.observe(editor.view.dom, { childList: true, subtree: true });
    fn();
    for (const m of obs.takeRecords()) {
        added += m.addedNodes.length;
        removed += m.removedNodes.length;
    }
    obs.disconnect();
    return { added, removed };
}

describe("typing hot path: DOM churn and widget key stability", () => {
    it("Enter at end of doc causes constant churn, not O(pages)", async () => {
        const editor = await makeEditor(600);
        expect(breaksOf(editor).length).toBeGreaterThan(30);

        const end = editor.state.doc.content.size;
        editor.commands.setTextSelection(end - 1);
        const r = churn(editor, () => {
            insertElement(editor, ScreenplayElement.Action, editor.state.selection.$anchor.after());
        });

        // The new <p>, the new/re-keyed trailing break + last-page widget.
        // Before the lazy-widget fix this was O(pages) (every widget rebuilt).
        expect(r.added).toBeLessThan(30);
        expect(r.removed).toBeLessThan(30);
    });

    it("Enter mid-document keeps downstream widget keys stable", async () => {
        const editor = await makeEditor(600);
        const breaks = breaksOf(editor);
        expect(breaks.length).toBeGreaterThan(30);

        const keysBefore = new Set(widgetKeysOf(editor));
        editor.commands.setTextSelection(breaks[4].pos - 4);
        insertElement(editor, ScreenplayElement.Action, editor.state.selection.$anchor.after());
        const keysAfter = widgetKeysOf(editor);

        // The cascade relocates widgets, but their rendered content (pagenum,
        // freespace, labels) is unchanged for all but the trailing pages — so
        // at most a few keys may differ. Key instability here would defeat
        // every DOM-reuse optimization downstream.
        const changed = keysAfter.filter((k) => !keysBefore.has(k));
        expect(changed.length).toBeLessThanOrEqual(3);
    });

    it("break widgets are skippable offscreen (content-visibility)", async () => {
        const editor = await makeEditor(600);
        const widget = (editor.view.dom as HTMLElement).querySelector(".pagination-page-break") as HTMLElement;
        expect(widget).toBeTruthy();
        expect(widget.style.getPropertyValue("content-visibility")).toBe("auto");
        expect(widget.style.getPropertyValue("contain-intrinsic-size")).toMatch(/none \d+(\.\d+)?px/);
    });

    it("header/footer HTML templates are parsed as markup, not text", async () => {
        const editor = await makeEditor(600);
        const dom = editor.view.dom as HTMLElement;

        // The configured `<p class="page-number">{page}.</p>` header must
        // produce a real <p> element, not a text node with literal angle
        // brackets. Guards against the textContent regression.
        const headerRight = dom.querySelector(".pagination-header-right") as HTMLElement;
        expect(headerRight).toBeTruthy();
        const pageNumberEl = headerRight.querySelector("p.page-number");
        expect(pageNumberEl).toBeTruthy();
        expect(headerRight.textContent).not.toContain("<p");
        // {page} placeholder is substituted with the page label.
        expect(pageNumberEl!.textContent).toMatch(/^\d+\.$/);
    });

    it("tags the first node of each page with a margin-reset class", async () => {
        // These node-decoration classes replace the `.pagination-page-break + p`
        // adjacent-sibling CSS rule (which restyled the whole document tail on
        // every edit). The class must land on the <p> immediately after each
        // page-break widget, and on the very first node, so the page-top margin
        // still gets zeroed without the sibling-combinator cost.
        const editor = await makeEditor(600);
        const dom = editor.view.dom as HTMLElement;

        // First node carries the doc-start class.
        expect(dom.querySelector("p.pagination-doc-start")).toBeTruthy();

        // Every whole-node page break is immediately followed by a
        // pagination-break-start node.
        const breakWidgets = Array.from(dom.querySelectorAll(".pagination-page-break"));
        expect(breakWidgets.length).toBeGreaterThan(5);
        let matched = 0;
        for (const w of breakWidgets) {
            let sib = w.nextElementSibling;
            while (sib && sib.tagName !== "P") sib = sib.nextElementSibling;
            if (sib && sib.classList.contains("pagination-break-start")) matched++;
        }
        // All non-split breaks (this fixture has no sentence splits) must match.
        expect(matched).toBe(breakWidgets.length);
    });
});
