/**
 * Shared helper that wires up all benchmark cases for a plugin bench file.
 *
 * Editors are created at module-evaluation time (when pluginBenchSuite is
 * called), OUTSIDE describe/bench blocks. This is necessary because
 * beforeAll/afterAll hooks do not execute for bench() in @vitest/browser.
 *
 * All 10 bench cases live in ONE describe so the reporter renders a single
 * timing table (a group needs 2+ tasks to show the table).
 */
import { describe, bench } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createTestEditor } from "./editor-factory";
import { largeDoc, emptyDoc } from "../fixtures/screenplay-fixture";

type MakeEditorFn = (content: JSONContent[]) => ReturnType<typeof createTestEditor>;

interface EditorEntry {
    editor: ReturnType<typeof createTestEditor>["editor"];
    pos: number;
}

const POSITIONS = [
    ["beginning", 0],
    ["middle", 1],
    ["end", 2],
] as const;

/** Wire up all 10 bench cases (1 empty + 3 positions × 3 tx types) for a plugin. */
export function pluginBenchSuite(suiteName: string, makeEditorFn: MakeEditorFn) {
    // ── Create all editors NOW (module-evaluation time) ─────────────────────
    // This runs before any bench() executes, keeping editor creation out of
    // the timed function without relying on beforeAll (broken in browser bench).
    const mkEmpty = (): EditorEntry => {
        const r = makeEditorFn(emptyDoc());
        const [pos] = r.threePositions("action");
        return { editor: r.editor, pos };
    };
    const mkLarge = (posIdx: 0 | 1 | 2): EditorEntry => {
        const r = makeEditorFn(largeDoc());
        const pos = r.threePositions("action")[posIdx];
        return { editor: r.editor, pos };
    };

    const emptyEntry = mkEmpty();
    const large: Record<string, EditorEntry> = {};
    for (const [posLabel, posIdx] of POSITIONS) {
        large[`${posLabel}-kp`] = mkLarge(posIdx);
        large[`${posLabel}-hold`] = mkLarge(posIdx);
        large[`${posLabel}-enter`] = mkLarge(posIdx);
    }

    // ── Register bench cases ────────────────────────────────────────────────
    describe(suiteName, () => {
        bench("empty doc — single keypress", () => {
            emptyEntry.editor.view.dispatch(
                emptyEntry.editor.state.tr.insertText("x", emptyEntry.pos),
            );
        });

        for (const [posLabel] of POSITIONS) {
            bench(`${posLabel} — single keypress — large doc`, () => {
                const e = large[`${posLabel}-kp`];
                e.editor.view.dispatch(e.editor.state.tr.insertText("x", e.pos));
            });

            bench(`${posLabel} — hold key 50x — large doc`, () => {
                const e = large[`${posLabel}-hold`];
                for (let i = 0; i < 50; i++) {
                    e.editor.view.dispatch(e.editor.state.tr.insertText("x", e.pos));
                }
            });

            bench(`${posLabel} — enter key 10x — large doc`, () => {
                const e = large[`${posLabel}-enter`];
                for (let i = 0; i < 10; i++) {
                    e.editor.view.dispatch(e.editor.state.tr.insertText("\n", e.pos));
                }
            });
        }
    });
}
