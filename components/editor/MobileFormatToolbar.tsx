"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    BookPlus,
    ChevronUp,
    Columns2,
    Italic,
    Loader2,
    MessageSquarePlus,
    SeparatorHorizontal,
    SpellCheck,
    Underline,
} from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { useIsTouch } from "@src/lib/utils/hooks";
import { applyElement, applyMarkToggle } from "@src/lib/screenplay/editor";
import { applyTitlePageElement, applyTitlePageMarkToggle } from "@src/lib/titlepage/editor";
import { makeDualDialogue } from "@src/lib/screenplay/dual-dialogue";
import { refreshSpellcheck } from "@src/lib/spellcheck/spellcheck-extension";
import { getAddComment } from "@src/lib/editor/comment-actions";
import { useCaretState } from "@src/lib/editor/use-caret-state";
import { useEditorFocused } from "@src/lib/editor/use-editor-focused";
import { ScreenplayElement, Style, TitlePageElement } from "@src/lib/utils/enums";
import { join } from "@src/lib/utils/misc";

import styles from "./MobileFormatToolbar.module.css";

// Movement (px) past which a pointer gesture on a toolbar button counts as a
// scroll of the button row rather than a tap, so it toggles nothing (see endTap).
const TAP_SLOP = 8;

const SCREENPLAY_ELEMENTS_ORDER: ScreenplayElement[] = [
    ScreenplayElement.Scene,
    ScreenplayElement.Action,
    ScreenplayElement.Character,
    ScreenplayElement.Dialogue,
    ScreenplayElement.Parenthetical,
    ScreenplayElement.Transition,
    ScreenplayElement.Section,
    ScreenplayElement.Note,
];

const TITLEPAGE_ELEMENTS_ORDER: TitlePageElement[] = [
    TitlePageElement.Title,
    TitlePageElement.Author,
    TitlePageElement.Date,
    TitlePageElement.None,
];

/**
 * Touch-device formatting bar shown while a screenplay/title editor is focused.
 * Surfaces the element-type selector (moved here from the navbar so it's within
 * thumb reach while writing) plus the inline styling (bold, italic, underline)
 * and alignment controls.
 *
 * Gated on the pointer type rather than the phone width so tablets get it too —
 * an iPad writing with the on-screen keyboard needs the element picker in thumb
 * reach just as much as a phone does. On touch this is the *only* route to these
 * controls, the desktop bar having dropped its format dropdown in its favour, so
 * it shows whenever an editor is focused and never mind what the keyboard is
 * doing.
 *
 * Past those, the scrollable row continues into the actions a touch device has no
 * other way to reach: they live behind a right-click on desktop, which has no
 * touch equivalent — comment, manual page break, dual dialogue, and spelling
 * suggestions. Each only appears where it applies (see {@link useCaretState}), so
 * scrolling that far only ever turns up something usable.
 *
 * Renders as one item in [EditorBottomBar], which owns where the row sits — over
 * the keyboard, or resting near the bottom edge when there isn't one — and the
 * islands that flank it. Nothing here should reach for the viewport.
 *
 * The bar is only as wide as the controls in that first group (see
 * --tb-base-width), so on a tablet it stays a compact centred pill instead of an
 * iPad-wide one that is mostly empty — which puts the advanced actions just past
 * its right edge, a sideways drag away, marked by the edge fades (see edges).
 */
const MobileFormatToolbar = () => {
    const t = useTranslations("formatDropdown");
    const tMenu = useTranslations("contextMenu");
    const isTouch = useIsTouch();
    const {
        editor,
        draftEditor,
        documentEditor,
        titlePageEditor,
        focusedEditorType,
        selectedStyles,
        setSelectedStyles,
        selectedElement,
        setSelectedElement,
        selectedTitlePageElement,
        setSelectedTitlePageElement,
        repository,
        isReadOnly,
    } = useContext(ProjectContext);
    const { worker } = useSpellcheck();

    const isTitleContext = focusedEditorType === "title";
    const isDraftContext = focusedEditorType === "draft";
    // Both the shelf draft and a tree document report "draft" as their focus type
    // but register in different context slots, so that type alone can't say which
    // of the two is being written in — resolve it by which one actually holds
    // focus, the same way ProjectContext scopes search (see activeSearchEditor).
    // Falling back to either rather than to draftEditor alone matters: a tree
    // document with no shelf draft open would otherwise resolve to null and the
    // bar would never appear while writing in it.
    const activeEditor = isTitleContext
        ? titlePageEditor
        : isDraftContext
          ? ([draftEditor, documentEditor].find((e) => e?.isFocused) ?? draftEditor ?? documentEditor)
          : editor;

    const [elementMenuOpen, setElementMenuOpen] = useState(false);
    // The misspelling whose suggestions panel is open, or null when it's closed.
    // Held as the word rather than a flag so the panel closes by itself the moment
    // the caret leaves that word — its suggestions would otherwise be applied to a
    // different one (see spellMenuOpen).
    const [spellMenuWord, setSpellMenuWord] = useState<string | null>(null);
    // Suggestions as the worker returns them, tagged with the word they answer:
    // anything else means the current word's answer is still in flight.
    const [suggestions, setSuggestions] = useState<{ word: string; list: string[] } | null>(null);
    // Briefly true right after a tap dismisses a floating menu: shields the editor
    // from the tap iOS synthesizes at touch-end so the caret can't jump to the
    // tapped position (see raiseTapGuard).
    const [tapGuard, setTapGuard] = useState(false);
    // Which ends of the scrolling control row still have controls past them, and
    // so want an edge fade over them (see the measuring effect below).
    const [edges, setEdges] = useState({ start: false, end: false });
    const toolbarRef = useRef<HTMLDivElement>(null);
    // The scrolling control row itself, measured to drive those fades.
    const scrollerRef = useRef<HTMLDivElement>(null);
    // Down-point of an in-progress tap on a style/alignment button, used to tell a
    // tap from a sideways scroll of the button row (see startTap / endTap).
    const tapStart = useRef<{ x: number; y: number } | null>(null);

    const ELEMENT_LABELS: Record<string, string> = {
        [ScreenplayElement.Scene]: t("elements.scene"),
        [ScreenplayElement.Action]: t("elements.action"),
        [ScreenplayElement.Character]: t("elements.character"),
        [ScreenplayElement.Dialogue]: t("elements.dialogue"),
        [ScreenplayElement.Parenthetical]: t("elements.parenthetical"),
        [ScreenplayElement.Transition]: t("elements.transition"),
        [ScreenplayElement.Section]: t("elements.section"),
        [ScreenplayElement.Note]: t("elements.note"),
        [TitlePageElement.Title]: t("titlePageElements.title"),
        [TitlePageElement.Author]: t("titlePageElements.author"),
        [TitlePageElement.Date]: t("titlePageElements.date"),
        [TitlePageElement.None]: t("titlePageElements.none"),
    };

    const elementOrder = isTitleContext ? TITLEPAGE_ELEMENTS_ORDER : SCREENPLAY_ELEMENTS_ORDER;
    const currentElement = isTitleContext ? selectedTitlePageElement : selectedElement;

    const editorFocused = useEditorFocused(activeEditor);

    // Only mount on a touch device, once the target editor itself is focused.
    // editorFocused excludes the case where another field (e.g. search) holds focus
    // while a stale focusedEditorType lingers.
    //
    // Deliberately NOT gated on whether a keyboard is up. The desktop bar drops its
    // format dropdown on touch precisely because this pill owns those controls
    // ([ProjectNavbarDesktop]), so an iPad on a Magic Keyboard was left with
    // neither, and no way at all to reach the element picker, comments, spelling or
    // page breaks. Where the pill sits is [EditorBottomBar]'s problem; whether it
    // exists is this.
    //
    // Declared up here, above its first use rather than next to the render, because
    // the caret subscription below is scoped to it.
    const isVisible = isTouch && !!activeEditor && focusedEditorType !== null && editorFocused;


    // Keeps the alignment highlight and the advanced actions in sync with the
    // caret. Scoped to isVisible so the per-transaction read costs nothing while
    // the bar is hidden.
    const caret = useCaretState(activeEditor, isVisible, isTitleContext);

    // Close an open menu only when the pointer-down lands outside the whole pill.
    // Taps on the style/alignment controls (which sit outside the element wrapper
    // but inside the pill) must not dismiss the menu.
    //
    // Capture phase, so a tap on one of the sibling islands ([EditorBottomBar])
    // still dismisses these: every control in that row stops propagation to keep
    // the tap off the editor, which a bubble-phase listener on document would
    // never see.
    useEffect(() => {
        if (!elementMenuOpen && !spellMenuWord) return;
        const onDown = (e: PointerEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                setElementMenuOpen(false);
                setSpellMenuWord(null);
            }
        };
        document.addEventListener("pointerdown", onDown, true);
        return () => document.removeEventListener("pointerdown", onDown, true);
    }, [elementMenuOpen, spellMenuWord]);

    const spellWord = caret.spellError?.word ?? null;
    // Open only while the caret is still on the word the panel was opened for, so
    // moving on closes it without anything having to clear the state.
    const spellMenuOpen = spellMenuWord !== null && spellMenuWord === spellWord;
    // null renders as "still thinking"; an empty list as "no suggestions", which is
    // also what a missing worker (spellcheck off / dictionary not loaded) shows.
    const displaySuggestions = !worker
        ? []
        : suggestions?.word === spellWord
          ? suggestions.list
          : null;

    // Ask the worker for suggestions, but only once the panel is actually open —
    // the caret crosses plenty of misspellings that are never tapped, and each
    // request is a full dictionary lookup.
    useEffect(() => {
        if (!spellMenuOpen || !spellWord || !worker) return;
        const handler = (e: MessageEvent) => {
            if (e.data.type === "SUGGEST_RESULT" && e.data.word === spellWord) {
                setSuggestions({ word: spellWord, list: e.data.suggestions });
            }
        };
        worker.addEventListener("message", handler);
        worker.postMessage({ type: "SUGGEST", word: spellWord });
        return () => worker.removeEventListener("message", handler);
    }, [spellMenuOpen, spellWord, worker]);

    const toggleStyle = useCallback(
        (style: Style) => {
            if (isReadOnly || !activeEditor) return;
            setSelectedStyles((prev) => (prev ^ style) as Style);
            // refocus: false — the editor is already focused here; a programmatic
            // re-focus drops the iOS keyboard on the mark-removal path (see
            // applyMarkToggle).
            if (isTitleContext) {
                applyTitlePageMarkToggle(activeEditor, style, false);
            } else {
                applyMarkToggle(activeEditor, style, false);
            }
        },
        [activeEditor, isTitleContext, isReadOnly, setSelectedStyles],
    );

    // Raised whenever a floating menu is dismissed by a tap on one of its items:
    // iOS fires a synthesized mousedown at touch-end, and once the item unmounts
    // that tap falls through to the editor behind it and moves the caret. The
    // guard (see render) covers the editor for a beat to absorb it, then lowers
    // itself below.
    const raiseTapGuard = useCallback(() => setTapGuard(true), []);

    const selectElement = useCallback(
        (element: ScreenplayElement | TitlePageElement) => {
            setElementMenuOpen(false);
            if (isReadOnly || !activeEditor) return;
            if (isTitleContext) {
                setSelectedTitlePageElement(element as TitlePageElement);
                applyTitlePageElement(activeEditor, element as TitlePageElement);
            } else {
                setSelectedElement(element as ScreenplayElement);
                applyElement(activeEditor, element as ScreenplayElement);
            }
            raiseTapGuard();
        },
        [
            activeEditor,
            isTitleContext,
            isReadOnly,
            raiseTapGuard,
            setSelectedElement,
            setSelectedTitlePageElement,
        ],
    );

    // Lower the guard once the synthesized tap has had time to land — and drop the
    // timer if the toolbar unmounts mid-gesture.
    useEffect(() => {
        if (!tapGuard) return;
        const timer = setTimeout(() => setTapGuard(false), 350);
        return () => clearTimeout(timer);
    }, [tapGuard]);

    const setAlignment = useCallback(
        (align: string) => {
            if (isReadOnly || !activeEditor) return;
            // No .focus(): the editor is already focused, and re-focusing risks
            // dropping the iOS keyboard (see applyMarkToggle / toggleStyle).
            // The highlight follows from the resulting transaction (see the caret
            // effect), so there is nothing to set optimistically here.
            if (isTitleContext) {
                activeEditor.chain().updateAttributes("tp-text", { textAlign: align }).run();
            } else {
                const nodeType = activeEditor.state.selection.$anchor.parent.type.name;
                activeEditor
                    .chain()
                    .updateAttributes(nodeType, { textAlign: align === "left" ? null : align })
                    .run();
            }
        },
        [activeEditor, isTitleContext, isReadOnly],
    );

    // ---- Advanced actions (right-click-only on desktop) ----

    const addComment = useCallback(() => {
        if (isReadOnly || !activeEditor || !caret.commentNodeId) return;
        // Creating the comment opens its thread with the text area focused, which
        // takes the keyboard from the editor and tears this bar down — expected:
        // the user's next input belongs to the comment, not the script.
        getAddComment(activeEditor)?.(caret.commentNodeId);
    }, [activeEditor, caret.commentNodeId, isReadOnly]);

    const togglePageBreak = useCallback(() => {
        if (isReadOnly || !activeEditor || !caret.pageBreak) return;
        activeEditor.commands.toggleManualPageBreak(caret.pageBreak.pos);
    }, [activeEditor, caret.pageBreak, isReadOnly]);

    const applyDualDialogue = useCallback(() => {
        if (isReadOnly || !activeEditor || caret.dualDialoguePos === null) return;
        makeDualDialogue(activeEditor, caret.dualDialoguePos);
    }, [activeEditor, caret.dualDialoguePos, isReadOnly]);

    const replaceSpelling = useCallback(
        (suggestion: string) => {
            const spellError = caret.spellError;
            setSpellMenuWord(null);
            raiseTapGuard();
            if (isReadOnly || !activeEditor || !spellError) return;
            const { tr, schema } = activeEditor.state;
            activeEditor.view.dispatch(
                tr.replaceWith(spellError.from, spellError.to, schema.text(suggestion)),
            );
        },
        [activeEditor, caret.spellError, isReadOnly, raiseTapGuard],
    );

    const addToDictionary = useCallback(() => {
        const spellError = caret.spellError;
        setSpellMenuWord(null);
        raiseTapGuard();
        if (isReadOnly || !activeEditor || !spellError) return;
        // Project-level Yjs dictionary (synced to collaborators); the observer in
        // use-document-editor forwards it to the worker. Only when there is no
        // project state does the word go straight to the worker instead.
        const projectState = repository?.getState();
        if (projectState) {
            projectState.dictionary().set(spellError.word, true);
        } else if (worker) {
            worker.postMessage({ type: "ADD_WORD", word: spellError.word });
            refreshSpellcheck(activeEditor);
        }
    }, [activeEditor, caret.spellError, isReadOnly, raiseTapGuard, repository, worker]);

    // Advanced actions show only where they apply, so a tap always does
    // something — and the row never grows past what the caret can actually use.
    // (All four write to the document, so a viewer gets none of them and the
    // group collapses to nothing, separator included.)
    const canSpellcheck = !isReadOnly && !!caret.spellError;
    const canComment =
        !isReadOnly && !!caret.commentNodeId && !!activeEditor && !!getAddComment(activeEditor);
    const canPageBreak = !isReadOnly && !!caret.pageBreak;
    const canDualDialogue = !isReadOnly && caret.dualDialoguePos !== null;
    const hasAdvanced = canSpellcheck || canComment || canPageBreak || canDualDialogue;

    // Fade each edge of the control row only where it has more to scroll to.
    // Measured rather than derived from hasAdvanced: on a phone the bar is
    // narrower than the always-present controls, so the alignment group runs past
    // the edge too, and a cue keyed off the advanced actions alone would leave
    // those clipped with nothing to say so. Re-measured on scroll, on resize
    // (rotation), and whenever a caret move adds or drops one of the advanced
    // buttons — that changes the row's scroll width without resizing the row.
    useEffect(() => {
        const row = scrollerRef.current;
        if (!row) return;
        const measure = () => {
            // 1px of slack at both ends: iOS settles scrollLeft on fractional
            // values, which would otherwise never read as fully scrolled.
            const max = row.scrollWidth - row.clientWidth;
            const next = { start: row.scrollLeft > 1, end: row.scrollLeft < max - 1 };
            setEdges((prev) =>
                prev.start === next.start && prev.end === next.end ? prev : next,
            );
        };
        measure();
        row.addEventListener("scroll", measure, { passive: true });
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => {
            row.removeEventListener("scroll", measure);
            observer.disconnect();
        };
    }, [isVisible, canSpellcheck, canComment, canPageBreak, canDualDialogue]);

    if (!isVisible) return null;

    // Fire on pointer-down and swallow the event so focus (and the on-screen
    // keyboard) stays on the editor — a normal click would blur it first. Stopping
    // propagation also keeps the tap from reaching the editor as a caret move.
    // Used by the element trigger and by both menus' items, none of which live in
    // a scroller — the buttons that do use startTap/endTap below instead.
    const action = (fn: () => void) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
    };

    // The style/alignment buttons sit in a horizontally scrollable row, so they
    // can't fire on pointer-down: a scroll that starts on a button would toggle it.
    // Record the down point (startTap) and only act on pointer-up when the pointer
    // barely moved (endTap); a drag past the slop — or the pointercancel iOS fires
    // once it claims the gesture for scrolling (cancelTap) — toggles nothing. Focus
    // is held by the toolbar's onMouseDown, not by acting on pointer-down.
    const startTap = (e: React.PointerEvent) => {
        tapStart.current = { x: e.clientX, y: e.clientY };
    };
    const endTap = (fn: () => void) => (e: React.PointerEvent) => {
        const start = tapStart.current;
        tapStart.current = null;
        if (!start) return;
        if (Math.abs(e.clientX - start.x) > TAP_SLOP || Math.abs(e.clientY - start.y) > TAP_SLOP) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        fn();
    };
    const cancelTap = () => {
        tapStart.current = null;
    };

    const styleBtn = (active: boolean) => join(styles.btn, active ? styles.active : "");

    return (
        <>
            {/* Transparent shield raised for a beat after a menu pick: it sits
                over the editor (below the toolbar) so the tap iOS synthesizes at
                touch-end lands here and is swallowed, never reaching the editor. */}
            {tapGuard && (
                <div className={styles.tap_guard} onPointerDown={(e) => e.preventDefault()} />
            )}
            <div className={styles.toolbar} role="toolbar" ref={toolbarRef}>
                {/* Element-type selector — the primary control, opens a menu upward. */}
                <div className={styles.element}>
                    {elementMenuOpen && (
                        <div className={styles.element_menu}>
                            {elementOrder.map((element) => (
                                <button
                                    key={element}
                                    type="button"
                                    className={join(
                                        styles.element_item,
                                        element === currentElement ? styles.element_item_active : "",
                                    )}
                                    onPointerDown={action(() => selectElement(element))}
                                >
                                    {ELEMENT_LABELS[element]}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        aria-label="Element type"
                        aria-expanded={elementMenuOpen}
                        className={styles.element_trigger}
                        onPointerDown={action(() => {
                            setSpellMenuWord(null);
                            setElementMenuOpen((prev) => !prev);
                        })}
                    >
                        <span className={styles.element_label}>
                            {ELEMENT_LABELS[currentElement as string] ?? ""}
                        </span>
                        <ChevronUp
                            size={16}
                            className={join(styles.chevron, elementMenuOpen ? styles.chevron_open : "")}
                        />
                    </button>
                </div>

                <div className={styles.format_wrap}>
                    <div className={styles.format_group} ref={scrollerRef}>
                        <div className={styles.group}>
                            <button
                                type="button"
                                aria-label="Bold"
                                aria-pressed={!!(selectedStyles & Style.Bold)}
                                className={styleBtn(!!(selectedStyles & Style.Bold))}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => toggleStyle(Style.Bold))}
                                onPointerCancel={cancelTap}
                            >
                                <Bold size={18} strokeWidth={3} />
                            </button>
                            <button
                                type="button"
                                aria-label="Italic"
                                aria-pressed={!!(selectedStyles & Style.Italic)}
                                className={styleBtn(!!(selectedStyles & Style.Italic))}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => toggleStyle(Style.Italic))}
                                onPointerCancel={cancelTap}
                            >
                                <Italic size={18} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                aria-label="Underline"
                                aria-pressed={!!(selectedStyles & Style.Underline)}
                                className={styleBtn(!!(selectedStyles & Style.Underline))}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => toggleStyle(Style.Underline))}
                                onPointerCancel={cancelTap}
                            >
                                <Underline size={18} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className={styles.separator} />

                        <div className={styles.group}>
                            <button
                                type="button"
                                aria-label="Align left"
                                aria-pressed={caret.align === "left"}
                                className={styleBtn(caret.align === "left")}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => setAlignment("left"))}
                                onPointerCancel={cancelTap}
                            >
                                <AlignLeft size={18} />
                            </button>
                            <button
                                type="button"
                                aria-label="Align center"
                                aria-pressed={caret.align === "center"}
                                className={styleBtn(caret.align === "center")}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => setAlignment("center"))}
                                onPointerCancel={cancelTap}
                            >
                                <AlignCenter size={18} />
                            </button>
                            <button
                                type="button"
                                aria-label="Align right"
                                aria-pressed={caret.align === "right"}
                                className={styleBtn(caret.align === "right")}
                                onPointerDown={startTap}
                                onPointerUp={endTap(() => setAlignment("right"))}
                                onPointerCancel={cancelTap}
                            >
                                <AlignRight size={18} />
                            </button>
                        </div>

                        {/* Advanced actions, reachable by scrolling on past the
                            everyday formatting — on desktop these live behind a
                            right-click, which a touch device has no equivalent for. */}
                        {hasAdvanced && (
                            <>
                                <div className={styles.separator} />

                                <div className={styles.group}>
                                    {canSpellcheck && (
                                        <button
                                            type="button"
                                            aria-label={`Spelling: ${caret.spellError!.word}`}
                                            aria-expanded={spellMenuOpen}
                                            className={styleBtn(spellMenuOpen)}
                                            onPointerDown={startTap}
                                            onPointerUp={endTap(() => {
                                                setElementMenuOpen(false);
                                                setSpellMenuWord(spellMenuOpen ? null : spellWord);
                                            })}
                                            onPointerCancel={cancelTap}
                                        >
                                            <SpellCheck size={18} />
                                        </button>
                                    )}
                                    {canComment && (
                                        <button
                                            type="button"
                                            aria-label={tMenu("addComment")}
                                            className={styles.btn}
                                            onPointerDown={startTap}
                                            onPointerUp={endTap(addComment)}
                                            onPointerCancel={cancelTap}
                                        >
                                            <MessageSquarePlus size={18} />
                                        </button>
                                    )}
                                    {canPageBreak && (
                                        <button
                                            type="button"
                                            aria-label={
                                                caret.pageBreak!.active
                                                    ? tMenu("removePageBreak")
                                                    : tMenu("insertPageBreak")
                                            }
                                            aria-pressed={caret.pageBreak!.active}
                                            className={styleBtn(caret.pageBreak!.active)}
                                            onPointerDown={startTap}
                                            onPointerUp={endTap(togglePageBreak)}
                                            onPointerCancel={cancelTap}
                                        >
                                            <SeparatorHorizontal size={18} />
                                        </button>
                                    )}
                                    {canDualDialogue && (
                                        <button
                                            type="button"
                                            aria-label={tMenu("makeDualDialogue")}
                                            className={styles.btn}
                                            onPointerDown={startTap}
                                            onPointerUp={endTap(applyDualDialogue)}
                                            onPointerCancel={cancelTap}
                                        >
                                            <Columns2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Edge cues that the row carries on past the bar. Siblings of
                        the scroller, not children: inside it they would slide away
                        with the very buttons they are there to mark. */}
                    {edges.start && <div className={join(styles.fade, styles.fade_start)} />}
                    {edges.end && <div className={join(styles.fade, styles.fade_end)} />}
                </div>

                {/* Spelling suggestions for the misspelling under the caret. A
                    child of the bar rather than of the scrolling row: inside it
                    the panel would be clipped (an overflow-x scroller clips its
                    overflowing children on BOTH axes), and it would slide away
                    with the buttons. */}
                {canSpellcheck && spellMenuOpen && (
                    <div className={styles.spell_menu}>
                        {displaySuggestions === null && (
                            <div className={styles.spell_status}>
                                <Loader2 size={14} className={styles.spinner} />
                            </div>
                        )}
                        {displaySuggestions?.length === 0 && (
                            <div className={styles.spell_status}>{tMenu("noSuggestions")}</div>
                        )}
                        {displaySuggestions?.map((suggestion) => (
                            <button
                                key={suggestion}
                                type="button"
                                className={styles.spell_item}
                                onPointerDown={action(() => replaceSpelling(suggestion))}
                            >
                                {suggestion}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={join(styles.spell_item, styles.spell_dictionary)}
                            onPointerDown={action(addToDictionary)}
                        >
                            <BookPlus size={14} />
                            {tMenu("addToDictionary")}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

export default MobileFormatToolbar;
