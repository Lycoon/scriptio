import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";

import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { createSceneLockingExtension } from "@src/lib/screenplay/extensions/scene-locking-extension";
import {
    ScriptioPagination,
    getPageAnchorInfo,
    paginationKey,
} from "@src/lib/screenplay/extensions/pagination-extension";
import {
    omitSceneByUuid,
    unomitSceneByUuid,
    computeSceneLabels,
    computeAbsorbedPageTokens,
} from "@src/lib/screenplay/scene-locking";
import type { ProjectRepository } from "@src/lib/project/project-repository";
import type { PersistentScene } from "@src/lib/screenplay/scenes";
import { PersistentPageMap } from "@src/lib/screenplay/page-locking";

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

// Minimal stand-in for ProjectRepository covering only what omit/unomit use,
// including the page-lock map (so re-homing locks is exercised end to end).
const SCENE_FIELDS = [
    "synopsis", "color", "token", "omitted", "originalHeading",
    "omittedBody", "omittedPageLocks", "reanchoredSuccessor",
] as const;
function makeRepo() {
    const scenes: Record<string, PersistentScene> = {};
    const pages: PersistentPageMap = {};
    let pageLocking = false;
    return {
        scenes,
        pages,
        get pageLocking() { return pageLocking; },
        setPageLocking: (v: boolean) => { pageLocking = v; },
        getScene: (id: string) => scenes[id],
        upsertScene: (id: string, data: Partial<PersistentScene>) => {
            const merged: PersistentScene = { ...(scenes[id] ?? {}) };
            for (const k of SCENE_FIELDS) if (k in data) (merged as Record<string, unknown>)[k] = data[k];
            for (const k of SCENE_FIELDS) if (merged[k] === undefined) delete merged[k];
            scenes[id] = merged;
            return id;
        },
        getPage: (id: string) => pages[id],
        upsertPage: (id: string, data: { token?: unknown; splitOffset?: number }) => {
            const merged = { ...(pages[id] ?? {}) } as Record<string, unknown>;
            for (const k of ["token", "splitOffset"] as const) if (k in data) merged[k] = data[k];
            for (const k of ["token", "splitOffset"] as const) if (merged[k] === undefined) delete merged[k];
            pages[id] = merged as PersistentPageMap[string];
            return id;
        },
        deletePage: (id: string) => { delete pages[id]; },
        transact: (fn: () => void) => fn(),
    };
}

async function makeEditor(content: object[]) {
    injectStyle();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const repo = makeRepo();

    const editor = new Editor({
        element: el,
        injectCSS: false,
        autofocus: false,
        content: { type: "doc", content },
        extensions: [
            ...BASE_EXTENSIONS,
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            createSceneLockingExtension({
                getSceneLocking: () => true,
                getScenes: () => repo.scenes,
                getNumberingStyle: () => "suffix",
                getSkippedLetters: () => [],
            }),
            ScriptioPagination.configure({
                pageHeight: 200, pageWidth: 600, marginTop: 0, marginBottom: 0,
                marginLeft: 0, marginRight: 0, pageGap: 10,
                getPageLocking: () => repo.pageLocking,
                getPageLocks: () => repo.pages,
                getSkippedLetters: () => [],
                getOmittedPages: () => computeAbsorbedPageTokens(repo.scenes),
            }),
        ],
    });
    await new Promise((r) => setTimeout(r, 80));
    (editor.storage as unknown as Record<string, { fontsReady: boolean }>).Pagination.fontsReady = true;
    forcePagination(editor);
    return { editor, repo: repo as unknown as ProjectRepository };
}

function forcePagination(editor: Editor) {
    const tr = editor.state.tr;
    tr.setMeta("forcePaginationUpdate", true);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
}

function breaksOf(editor: Editor) {
    const st = paginationKey.getState(editor.state) as { breaks: { pos: number; anchorId?: string }[] } | undefined;
    return st?.breaks ?? [];
}

function pageStateOf(editor: Editor) {
    return paginationKey.getState(editor.state) as
        | { breaks: { pos: number; anchorId?: string; label?: string; prevLabel?: string }[]; firstPageLabel: string }
        | undefined;
}

function childTypes(editor: Editor) {
    const out: string[] = [];
    editor.state.doc.forEach((n) => out.push(n.type.name));
    return out;
}

function lockAllPages(editor: Editor, repo: ProjectRepository) {
    const infos = getPageAnchorInfo(editor);
    const anchors = infos.map((a) => a.anchorId);
    const labels = computeSceneLabels(anchors, {}, "suffix", []);
    const pages = (repo as unknown as { pages: PersistentPageMap }).pages;
    for (const k of Object.keys(pages)) delete pages[k];
    labels.forEach((l, i) => { pages[anchors[i]] = { token: l.token, splitOffset: infos[i]?.splitOffset }; });
    (repo as unknown as { setPageLocking: (v: boolean) => void }).setPageLocking(true);
    forcePagination(editor);
}

const scene = (id: string, text: string) => ({ type: "scene", attrs: { "data-id": id, class: "scene" }, content: [{ type: "text", text }] });
const action = (id: string, text: string) => ({ type: "action", attrs: { "data-id": id, class: "action" }, content: [{ type: "text", text }] });

describe("omitted scene: body is cut from the doc and restored on unomit", () => {
    it("omit removes body nodes and parks them; unomit restores verbatim", async () => {
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. KITCHEN - DAY"),
            action("a1", "She enters."),
            action("a2", "She cooks."),
            scene("s2", "EXT. STREET - NIGHT"),
            action("a3", "He waits."),
        ]);

        expect(childTypes(editor)).toEqual(["scene", "action", "action", "scene", "action"]);

        omitSceneByUuid(editor, repo, "s1");

        // Body of s1 (a1, a2) is gone from the doc; s2 + its body remain.
        expect(childTypes(editor)).toEqual(["scene", "scene", "action"]);
        // Heading text replaced; original + body parked in metadata.
        const sc = repo.getScene("s1")!;
        expect(sc.omitted).toBe(true);
        expect(sc.originalHeading).toBe("INT. KITCHEN - DAY");
        expect(sc.omittedBody?.length).toBe(2);
        expect(editor.state.doc.child(0).textContent).toBe("OMITTED");

        unomitSceneByUuid(editor, repo, "s1");

        // Doc structure and heading text restored; body data-ids preserved.
        expect(childTypes(editor)).toEqual(["scene", "action", "action", "scene", "action"]);
        expect(editor.state.doc.child(0).textContent).toBe("INT. KITCHEN - DAY");
        expect(editor.state.doc.child(1).attrs["data-id"]).toBe("a1");
        expect(editor.state.doc.child(2).attrs["data-id"]).toBe("a2");
        const sc2 = repo.getScene("s1")!;
        expect(sc2.omitted).toBeUndefined();
        expect(sc2.omittedBody).toBeUndefined();
    });

    it("with locked pages: omit keeps the next scene on its page; unomit adds no phantom", async () => {
        // Page 1 holds scene s1 + body filling it; s2 begins page 2.
        // (contentHeight 200, ~32px/node → 6 nodes fill page 1: s1 + 5 actions.)
        const body1 = Array.from({ length: 5 }, (_, i) => action(`a${i}`, `line ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. ONE"),
            ...body1,
            scene("s2", "INT. TWO"),
            action("b0", "two body 0"),
            action("b1", "two body 1"),
        ]);

        lockAllPages(editor, repo);
        const beforeBreaks = breaksOf(editor).length;
        expect(beforeBreaks).toBeGreaterThanOrEqual(1);
        // s2 anchors a locked break (it begins a page).
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);

        omitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // s2 still begins a page (its locked break survives) — the heading stuck
        // to its locked page rather than spilling upward.
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);

        unomitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Back to the original break count — no leftover phantom page.
        expect(breaksOf(editor).length).toBe(beforeBreaks);
    });

    it("scene crossing a locked page break: omit works, content removed, no upward spill", async () => {
        // s1 + body spans into a locked page 2 (so a BODY node anchors page 2),
        // then s2 sits lower. contentHeight 200, ~32px/node → 6 nodes per page.
        // Page 1: s1 + a0..a4 (6 nodes). Page 2 anchor = a5 (a body node).
        const body1 = Array.from({ length: 8 }, (_, i) => action(`a${i}`, `line ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. ONE"),
            ...body1,
            scene("s2", "INT. TWO"),
            action("b0", "two body 0"),
        ]);

        lockAllPages(editor, repo);
        // The page-2 anchor is a body node of s1 (it crosses the lock).
        const lockedBefore = breaksOf(editor).filter((b) => b.anchorId && b.anchorId.startsWith("a"));
        expect(lockedBefore.length).toBeGreaterThanOrEqual(1);
        const beforeBreaks = breaksOf(editor).length;

        omitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Omit actually applied: the body is gone and the heading reads OMITTED.
        expect(childTypes(editor)).toEqual(["scene", "scene", "action"]);
        expect(editor.state.doc.child(0).textContent).toBe("OMITTED");
        // The lock re-homed onto s2 so it stays pinned to its page — no s1 body
        // anchor lingers, and s2 does not spill up onto page 1.
        const afterBreaks = breaksOf(editor);
        expect(afterBreaks.some((b) => b.anchorId === "s2")).toBe(true);
        expect(afterBreaks.some((b) => b.anchorId && b.anchorId.startsWith("a"))).toBe(false);

        unomitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Original structure and locked layout restored.
        expect(editor.state.doc.child(0).textContent).toBe("INT. ONE");
        expect(breaksOf(editor).length).toBe(beforeBreaks);
        expect(breaksOf(editor).some((b) => b.anchorId && b.anchorId.startsWith("a"))).toBe(true);
    });

    it("omitting a full locked page before another locked page combines the number (no jump)", async () => {
        // Page 1: s1 + a0..a4 (6 nodes). Page 2: a5..a10 (6 body nodes of s1).
        // Page 3: s2 + b0. With every page locked, page 2's anchor (a5) is a
        // body node of s1, and s2 begins its own locked page 3.
        const body1 = Array.from({ length: 11 }, (_, i) => action(`a${i}`, `line ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. ONE"),
            ...body1,
            scene("s2", "INT. TWO"),
            action("b0", "two body 0"),
        ]);

        lockAllPages(editor, repo);
        // Sanity: page 2 anchored by a body node, page 3 anchored by s2.
        expect(breaksOf(editor).some((b) => b.anchorId === "a5")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);

        omitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // s1's whole body (including the page-2 anchor a5) is gone; s2 stays
        // pinned to its locked page. The successor s2 is ALREADY locked, so the
        // removed page 2 can't be re-homed — it is absorbed into the FOLLOWING
        // surviving page (s2) as the low end of a range instead of vanishing.
        const st = pageStateOf(editor)!;
        const s2Break = st.breaks.find((b) => b.anchorId === "s2");
        expect(s2Break).toBeDefined();
        // Before the fix the first page read "1" and the next jumped to "3".
        expect(st.firstPageLabel).toBe("1");
        expect(s2Break!.label).toBe("2-3");
        expect(s2Break!.prevLabel).toBe("1");

        unomitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Restoring the scene clears the absorption: plain 1 / 2 / 3 numbering.
        const restored = pageStateOf(editor)!;
        expect(restored.firstPageLabel).toBe("1");
        expect(computeAbsorbedPageTokens(repo.scenes)).toHaveLength(0);
    });

    it("a collapsed page number is reclaimed when content grows back into the gap", async () => {
        // page 1: s0 + a0 + a1 + s1 heading + c0 + c1 (6 nodes, locked t1).
        // page 2: c2..c7 (s1 body — anchored by body node c2, locked t2).
        // page 3: s2 + d0 (locked t3).
        // s1 starts on page 1 and spills its body onto page 2, so the page-2
        // anchor is a *body* node that omit removes (forcing a collapse) — not
        // the heading, which survives as the OMITTED marker.
        const sceneBody = Array.from({ length: 8 }, (_, i) => action(`c${i}`, `c line ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s0", "INT. ZERO"),
            action("a0", "a0"),
            action("a1", "a1"),
            scene("s1", "INT. ONE"),
            ...sceneBody,
            scene("s2", "INT. TWO"),
            action("d0", "d0"),
        ]);

        lockAllPages(editor, repo);
        // Page 2 anchored by a body node of s1 (so omit collapses it), page 3 by s2.
        expect(breaksOf(editor).some((b) => b.anchorId === "c2")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);

        omitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Collapsed: page 1 stays "1"; the removed page 2 folds into the
        // following surviving page (s2) as "2-3".
        const collapsed = pageStateOf(editor)!;
        expect(collapsed.firstPageLabel).toBe("1");
        expect(collapsed.breaks.map((b) => b.label)).toEqual(["2-3"]);

        // Grow page 1: insert actions before the OMITTED heading so the heading
        // overflows into the gap, creating a provisional page there.
        let insertPos = -1;
        editor.state.doc.forEach((n, offset, index) => {
            if (index === 3) insertPos = offset; // the OMITTED (s1) heading
        });
        for (let i = 0; i < 3; i++) {
            const growNode = editor.schema.nodeFromJSON(action(`g${i}`, `grow ${i}`));
            editor.view.dispatch(editor.state.tr.insert(insertPos, growNode));
        }
        forcePagination(editor);

        // The new physical page in the gap reclaims the absorbed "2": page 1 is
        // back to plain "1", a real "2" page appears, and s2 is still "3".
        const grown = pageStateOf(editor)!;
        expect(grown.firstPageLabel).toBe("1");
        expect(grown.breaks.map((b) => b.label)).toEqual(["2", "3"]);
    });

    it("removing several locked pages accumulates the range, and inserts after it suffix off the survivor", async () => {
        // s1 spans pages 1-3 (body anchors page 2 = a5 and page 3 = a11); s2
        // fills page 4; s3 is page 5. Omitting s1 removes the page-2 and page-3
        // anchors at once, so the survivor (s2) must read "2-4". Then inserting
        // content between s2 and the next locked page (s3) creates a provisional
        // page that suffixes off s2's own number ("4A").
        const body1 = Array.from({ length: 17 }, (_, i) => action(`a${i}`, `line ${i}`));
        const body2 = Array.from({ length: 5 }, (_, i) => action(`b${i}`, `b line ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. ONE"),
            ...body1,
            scene("s2", "INT. TWO"),
            ...body2,
            scene("s3", "INT. THREE"),
        ]);

        lockAllPages(editor, repo);
        // Pages 2 and 3 anchored by body nodes of s1; page 4 by s2; page 5 by s3.
        expect(breaksOf(editor).some((b) => b.anchorId === "a5")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "a11")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "s3")).toBe(true);

        omitSceneByUuid(editor, repo, "s1");
        forcePagination(editor);

        // Two removed pages (2 and 3) accumulate into the following survivor
        // (s2 = "4") as "2-4"; s3 stays "5".
        const st = pageStateOf(editor)!;
        expect(st.firstPageLabel).toBe("1");
        expect(st.breaks.map((b) => b.label)).toEqual(["2-4", "5"]);

        // Insert content between s2's page and s3 so s2's page overflows. The new
        // page sits past the absorbed numbers (2, 3) but before s3, so it does
        // NOT reclaim them — it is a provisional suffix of s2's own number: "4A".
        let beforeS3 = -1;
        editor.state.doc.forEach((n, offset) => {
            if (n.attrs?.["data-id"] === "s3") beforeS3 = offset;
        });
        for (let i = 0; i < 3; i++) {
            const n = editor.schema.nodeFromJSON(action(`e${i}`, `extra ${i}`));
            editor.view.dispatch(editor.state.tr.insert(beforeS3, n));
            beforeS3 += n.nodeSize;
        }
        forcePagination(editor);

        const after = pageStateOf(editor)!;
        expect(after.firstPageLabel).toBe("1");
        expect(after.breaks.map((b) => b.label)).toEqual(["2-4", "4A", "5"]);
    });

    it("deleting the last (empty) element of a locked page collapses it and moves the cursor up", async () => {
        // page1: s1 + a0..a4 (6). page2: x0 + f0..f4 (6, anchor x0). page3: s2.
        const fillers = Array.from({ length: 5 }, (_, i) => action(`f${i}`, `f ${i}`));
        const { editor, repo } = await makeEditor([
            scene("s1", "INT. ONE"),
            action("a0", "a0"),
            action("a1", "a1"),
            action("a2", "a2"),
            action("a3", "a3"),
            action("a4", "a4"),
            action("x0", "page two"),
            ...fillers,
            scene("s2", "INT. TWO"),
        ]);

        lockAllPages(editor, repo);
        expect(breaksOf(editor).some((b) => b.anchorId === "x0")).toBe(true);
        expect(breaksOf(editor).some((b) => b.anchorId === "s2")).toBe(true);

        // Reduce page 2 to just its locked anchor x0: delete the body f0..f4
        // (allowed — they are not locked anchors).
        let f0start = -1;
        let f4end = -1;
        editor.state.doc.forEach((n, off) => {
            if (n.attrs?.["data-id"] === "f0") f0start = off;
            if (n.attrs?.["data-id"] === "f4") f4end = off + n.nodeSize;
        });
        editor.view.dispatch(editor.state.tr.delete(f0start, f4end));

        // Empty x0 so the locked page holds a single empty node — this is the
        // "last element" the user is trying to delete.
        let x0pos = -1;
        let x0size = 0;
        editor.state.doc.forEach((n, off) => {
            if (n.attrs?.["data-id"] === "x0") {
                x0pos = off;
                x0size = n.content.size;
            }
        });
        editor.view.dispatch(editor.state.tr.delete(x0pos + 1, x0pos + 1 + x0size));

        // Cursor at the start of the empty locked anchor, then Backspace (a real
        // keydown so the extension's keymap handler runs). The page must collapse
        // — not stay blank with a stranded empty node.
        editor.commands.focus();
        editor.commands.setTextSelection(x0pos + 1);
        editor.view.dom.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Backspace",
                code: "Backspace",
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
            }),
        );
        forcePagination(editor);

        // x0 is gone, the cursor sits at the end of the previous page, and the
        // collapsed page's number folds into the following page ("2-3").
        const kids: string[] = [];
        editor.state.doc.forEach((n) => kids.push(n.attrs["data-id"]));
        expect(kids).not.toContain("x0");
        expect(editor.state.selection.from).toBe(x0pos - 1);
        const st = pageStateOf(editor)!;
        expect(st.firstPageLabel).toBe("1");
        expect(st.breaks.map((b) => b.label)).toEqual(["2-3"]);
    });
});
