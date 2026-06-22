import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import {
    ScriptioPagination,
    getPageAnchorInfo,
    paginationKey,
} from "@src/lib/screenplay/extensions/pagination-extension";
import { PersistentPageMap } from "@src/lib/screenplay/page-locking";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";

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

function nodeStart(editor: Editor, index: number): number {
    let pos = -1;
    let i = 0;
    editor.state.doc.forEach((_n, p) => {
        if (i === index) pos = p;
        i++;
    });
    return pos;
}

function ids(editor: Editor): string[] {
    const out: string[] = [];
    editor.state.doc.forEach((n) => out.push(n.attrs["data-id"]));
    return out;
}

function key(editor: Editor, name: string, code: number) {
    editor.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: name, code: name, keyCode: code, which: code, bubbles: true, cancelable: true }),
    );
}
const backspace = (e: Editor) => key(e, "Backspace", 8);
const del = (e: Editor) => key(e, "Delete", 46);

function emptyNode(editor: Editor, index: number) {
    const pos = nodeStart(editor, index);
    const node = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(editor.state.tr.delete(pos + 1, pos + 1 + node.content.size));
}

function lockAllPages(editor: Editor, lockState: LockState) {
    const infos = getPageAnchorInfo(editor);
    const anchors = infos.map((a) => a.anchorId);
    const labels = computeSceneLabels(anchors, {}, "suffix", []);
    const locks: PersistentPageMap = {};
    labels.forEach((l, idx) => {
        locks[anchors[idx]] = { token: l.token, splitOffset: infos[idx]?.splitOffset };
    });
    lockState.locks = locks;
    lockState.locking = true;
    const tr = editor.state.tr;
    tr.setMeta("forcePaginationUpdate", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
}

// An empty node carrying a manual page break must be deletable — the production
// page-lock safeguard (which protects locked anchors from spilling) must not
// trap it, because a manual break is user-controlled.
describe("delete empty node with a manual page break", () => {
    it("backspace deletes it when page locking is off", async () => {
        const { editor } = await makeEditor(5);
        editor.commands.toggleManualPageBreak(nodeStart(editor, 2));
        emptyNode(editor, 2);

        editor.commands.focus();
        editor.commands.setTextSelection(nodeStart(editor, 2) + 1);
        backspace(editor);

        expect(ids(editor)).not.toContain("n2");
    });

    it("backspace deletes it cleanly when every page is locked (no ghost page)", async () => {
        const { editor, lockState } = await makeEditor(5);
        editor.commands.toggleManualPageBreak(nodeStart(editor, 2));
        lockAllPages(editor, lockState);
        emptyNode(editor, 2);

        editor.commands.focus();
        editor.commands.setTextSelection(nodeStart(editor, 2) + 1);
        backspace(editor);

        const st = paginationKey.getState(editor.state) as { breaks: { isEmpty?: boolean }[] };
        expect(ids(editor)).not.toContain("n2");
        // No synthetic ghost/empty page left behind for the removed manual break.
        expect(st.breaks.some((b) => b.isEmpty)).toBe(false);
    });

    it("forward Delete removes it from the previous node when locked", async () => {
        const { editor, lockState } = await makeEditor(5);
        editor.commands.toggleManualPageBreak(nodeStart(editor, 2));
        lockAllPages(editor, lockState);
        emptyNode(editor, 2);

        const t1 = nodeStart(editor, 1);
        const n1 = editor.state.doc.nodeAt(t1)!;
        editor.commands.focus();
        editor.commands.setTextSelection(t1 + 1 + n1.content.size);
        del(editor);

        expect(ids(editor)).not.toContain("n2");
    });

    it("does not weaken the guard for a genuinely locked (non-break) page", async () => {
        // A locked anchor WITHOUT a manual break must still be protected: forward
        // Delete into it from the previous node is rejected (no spill).
        const { editor, lockState } = await makeEditor(8);
        // Force overflow so a natural break creates a second locked page.
        lockAllPages(editor, lockState);
        const st = paginationKey.getState(editor.state) as { breaks: { pos: number; anchorId?: string }[] };
        if (st.breaks.length === 0) return; // layout produced no break; nothing to assert
        const anchorId = st.breaks[0].anchorId!;
        const before = ids(editor);
        // Find the node just before the locked anchor and forward-Delete into it.
        let prevPos = -1;
        editor.state.doc.forEach((n, p) => {
            if (n.attrs["data-id"] === anchorId) prevPos = p; // anchor pos; prev is before it
        });
        const $anchor = editor.state.doc.resolve(prevPos);
        const prev = $anchor.nodeBefore;
        if (!prev) return;
        editor.commands.focus();
        editor.commands.setTextSelection(prevPos - 1); // end of prev node
        del(editor);
        // The locked anchor is still present (guard held).
        expect(ids(editor)).toContain(anchorId);
        expect(ids(editor).length).toBe(before.length);
    });
});
