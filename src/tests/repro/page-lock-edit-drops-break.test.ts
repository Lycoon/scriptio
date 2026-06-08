import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS, applyElement } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import {
    ScriptioPagination,
    getPageAnchorInfo,
    paginationKey,
} from "@src/lib/screenplay/extensions/pagination-extension";
import { PersistentPageMap } from "@src/lib/screenplay/page-locking";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { ScreenplayElement } from "@src/lib/utils/enums";

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
        .ProseMirror > p.dialogue, #pagination-test-div > p.dialogue { margin-top: 0; }
        .ProseMirror > p.parenthetical, #pagination-test-div > p.parenthetical { margin-top: 0; }
        .ProseMirror > .pagination-page-break + p,
        .ProseMirror > .pagination-first-page + p { margin-top: 0 !important; }
    `;
    document.head.appendChild(s);
}

type LockState = { locking: boolean; locks: PersistentPageMap };

async function makeEditor(n: number) {
    injectStyle();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const lockState: LockState = { locking: false, locks: {} };

    const content: object[] = [];
    for (let i = 0; i < n; i++) {
        content.push({ type: "action", attrs: { "data-id": `n${i}`, class: "action" }, content: [{ type: "text", text: `L${i}` }] });
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
                getPageLocking: () => lockState.locking,
                getPageLocks: () => lockState.locks,
                getSkippedLetters: () => [],
            }),
        ],
    });
    await new Promise((r) => setTimeout(r, 80));
    (editor.storage as unknown as Record<string, { fontsReady: boolean }>).Pagination.fontsReady = true;
    return { editor, lockState };
}

function force(editor: Editor) {
    const tr = editor.state.tr;
    tr.setMeta("forcePaginationUpdate", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
}

function breaksOf(editor: Editor) {
    const st = paginationKey.getState(editor.state) as
        | { breaks: { pos: number; freespace: number; anchorId?: string; label?: string }[] }
        | undefined;
    return st?.breaks ?? [];
}

function lockAllPages(editor: Editor, lockState: LockState) {
    const anchorInfos = getPageAnchorInfo(editor);
    const anchors = anchorInfos.map((a) => a.anchorId);
    const labels = computeSceneLabels(anchors, {}, "suffix", []);
    const locks: PersistentPageMap = {};
    labels.forEach((l, idx) => {
        locks[anchors[idx]] = { token: l.token, splitOffset: anchorInfos[idx]?.splitOffset };
    });
    lockState.locks = locks;
    lockState.locking = true;
    force(editor);
}

function lastNodeOfPage1Pos(editor: Editor) {
    const first = breaksOf(editor)[0];
    let pos = -1;
    editor.state.doc.forEach((node, p) => {
        if (p + node.nodeSize === first.pos) pos = p;
    });
    return pos;
}

function domBreakCount(editor: Editor) {
    return (editor.view.dom as HTMLElement).querySelectorAll(".pagination-page-break").length;
}

function fullPasses(editor: Editor) {
    return (editor.storage as unknown as Record<string, { fullPasses: number }>).Pagination.fullPasses;
}

function breakPositions(editor: Editor) {
    return breaksOf(editor)
        .map((b) => `${b.pos}:${b.label ?? ""}`)
        .join(",");
}


describe("page-lock: editing last node of page 1 via REAL commands", () => {
    async function setup() {
        const { editor, lockState } = await makeEditor(20);
        force(editor);
        lockAllPages(editor, lockState);
        return { editor, lockState };
    }

    // Regression: editing the last node of a page (no height change, so the
    // breaks array is identical) must not drop the page-break *widget* between
    // page 1 and the locked page 2. The DOM widget count must always match the
    // breaks array; before the fix it dropped by one (visual page merge).

    it("alignment change (updateAttributes) on last node of page 1", async () => {
        const { editor } = await setup();
        const before = breaksOf(editor).length;
        const lp = lastNodeOfPage1Pos(editor);
        const node = editor.state.doc.nodeAt(lp)!;
        editor.commands.setTextSelection(lp + 1);
        editor.chain().focus().updateAttributes(node.type.name, { textAlign: "center" }).run();
        const after = breaksOf(editor).length;
        expect(after).toBe(before);
        expect(domBreakCount(editor)).toBe(after);
    });

    it("re-apply Action type (applyElement) on last node of page 1", async () => {
        const { editor } = await setup();
        const before = breaksOf(editor).length;
        const lp = lastNodeOfPage1Pos(editor);
        editor.commands.setTextSelection(lp + 1);
        applyElement(editor, ScreenplayElement.Action);
        const after = breaksOf(editor).length;
        expect(after).toBe(before);
        expect(domBreakCount(editor)).toBe(after);
    });
});
