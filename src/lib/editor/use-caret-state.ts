"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";

import { canMakeDualDialogue } from "@src/lib/screenplay/dual-dialogue";
import { getNodeIdAtPos } from "@src/lib/screenplay/comment-anchors";
import { getSpellErrorAt } from "@src/lib/spellcheck/spellcheck-extension";
import { ScreenplayElement } from "@src/lib/utils/enums";

/**
 * Everything about the caret's surroundings that touch chrome renders from: the
 * block's alignment plus which of the advanced (right-click-only on desktop)
 * actions apply where it sits. Recomputed on every transaction, so it is kept as
 * one value that is only replaced when something actually differs — see
 * sameCaretState — to keep typing from re-rendering the consumer on every
 * keystroke.
 */
export type CaretState = {
    align: string;
    /** Misspelling under the caret, if the editor has spellcheck decorations. */
    spellError: { word: string; from: number; to: number } | null;
    /** Node the caret sits in, when it can anchor a comment. */
    commentNodeId: string | null;
    /** Top-level block under the caret + whether it already forces a break. */
    pageBreak: { pos: number; active: boolean } | null;
    /**
     * Start of a character block that can be merged with the one after it.
     * The block's start rather than the caret, though makeDualDialogue accepts
     * either: the caret moves with every keystroke inside the block, which would
     * fail sameCaretState and re-render for a value that never changed.
     */
    dualDialoguePos: number | null;
};

export const EMPTY_CARET_STATE: CaretState = {
    align: "left",
    spellError: null,
    commentNodeId: null,
    pageBreak: null,
    dualDialoguePos: null,
};

const sameCaretState = (a: CaretState, b: CaretState) =>
    a.align === b.align &&
    a.commentNodeId === b.commentNodeId &&
    a.dualDialoguePos === b.dualDialoguePos &&
    a.spellError?.word === b.spellError?.word &&
    a.spellError?.from === b.spellError?.from &&
    a.spellError?.to === b.spellError?.to &&
    a.pageBreak?.pos === b.pageBreak?.pos &&
    a.pageBreak?.active === b.pageBreak?.active;

/**
 * Track the caret's surroundings in `editor`, or EMPTY_CARET_STATE while
 * `enabled` is false.
 *
 * Listens on `transaction` rather than `selectionUpdate`: every dispatch emits
 * it, selection-only ones included, so the pair would only run this twice per
 * caret move — and half of what it reads changes under a *stationary* caret
 * anyway (spellcheck decorations landing from the worker, a page-break attribute
 * flipping, a collaborator's edit), which selectionUpdate misses. That does mean
 * running on every keystroke, so the whole read is a handful of position lookups
 * (all off ProseMirror's resolve cache) and the result is only committed when it
 * differs, leaving typing re-render-free.
 *
 * `enabled` is there so the read costs nothing where it would only ever be thrown
 * away: a mouse device, or any moment the editor doesn't hold focus.
 *
 * An external store rather than state-in-an-effect because the read has to be
 * seeded from the editor's current state on subscribe, and doing that through
 * setState renders twice every time the consumer comes up. sameCaretState doubles
 * as the snapshot's stability check — getSnapshot must return the same reference
 * until something actually changes, or React would see a new value on every
 * render and loop.
 */
export const useCaretState = (
    editor: Editor | null,
    enabled: boolean,
    /** Title-page editors have neither the nodes nor the pagination the advanced actions need. */
    isTitleContext: boolean,
): CaretState => {
    const caretCache = useRef<CaretState>(EMPTY_CARET_STATE);

    return useSyncExternalStore(
        useCallback(
            (callback: () => void) => {
                // A stale caret while there is nothing to track is harmless — the
                // consumer is hidden, and read() below re-seeds it as part of
                // re-subscribing, before it can show again.
                if (!enabled || !editor) return () => {};
                const read = () => {
                    const { state } = editor;
                    const { from, to } = state.selection;
                    const next: CaretState = {
                        ...EMPTY_CARET_STATE,
                        align: state.selection.$anchor.parent.attrs.textAlign || "left",
                    };

                    if (!isTitleContext) {
                        next.spellError =
                            getSpellErrorAt(state, from) ??
                            (to !== from ? getSpellErrorAt(state, to) : null);
                        next.commentNodeId = getNodeIdAtPos(state, from);

                        const $pos = state.doc.resolve(from);
                        if ($pos.depth >= 1) {
                            const nodeStart = $pos.before(1);
                            // Never the document's first block — nothing to break
                            // before it.
                            if (nodeStart > 0) {
                                next.pageBreak = {
                                    pos: nodeStart,
                                    active: !!$pos.node(1).attrs.pageBreak,
                                };
                            }
                            if (
                                $pos.node(1).attrs.class === ScreenplayElement.Character &&
                                canMakeDualDialogue(editor, nodeStart)
                            ) {
                                next.dualDialoguePos = nodeStart;
                            }
                        }
                    }

                    if (sameCaretState(caretCache.current, next)) return;
                    caretCache.current = next;
                    callback();
                };
                editor.on("transaction", read);
                read();
                return () => {
                    editor.off("transaction", read);
                };
            },
            [editor, enabled, isTitleContext],
        ),
        () => caretCache.current,
        () => EMPTY_CARET_STATE,
    );
};
