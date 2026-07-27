import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Shows the still-changing tail of a dictation transcript at the caret.
 *
 * The recogniser emits a phrase many times over while the writer speaks,
 * rewriting its own guess until it settles. Those interim guesses are rendered
 * as a widget decoration rather than inserted into the document: the doc is a
 * Y.Doc shared with collaborators and repaginated on every change, so writing
 * half-words into it would broadcast churn, flood the undo stack and re-run
 * pagination several times per second. A decoration lives only in this view,
 * costs nothing but a redraw, and disappears the moment the words it previewed
 * are committed for real (see `commitDictationText`).
 *
 * The text is driven entirely from outside via transaction metas — the mic
 * lives in the surrounding chrome (the editor footer on desktop, the navbar's
 * edit-mode cluster on phone) — and is drawn at whatever the current caret is,
 * which is exactly where dictated text gets inserted.
 */

const dictationPreviewKey = new PluginKey<string>("dictationPreview");
const SET_META = "dictationPreviewSet";

export const createDictationPreviewExtension = () =>
    Extension.create({
        name: "dictationPreview",

        addProseMirrorPlugins() {
            return [
                new Plugin<string>({
                    key: dictationPreviewKey,
                    state: {
                        init: () => "",
                        apply(tr, value) {
                            const meta = tr.getMeta(SET_META);
                            return typeof meta === "string" ? meta : value;
                        },
                    },
                    props: {
                        decorations(state) {
                            const text = dictationPreviewKey.getState(state);
                            if (!text) return null;
                            return DecorationSet.create(state.doc, [
                                Decoration.widget(
                                    state.selection.head,
                                    () => {
                                        const span = document.createElement("span");
                                        span.className = "dictation-preview";
                                        span.textContent = text;
                                        span.contentEditable = "false";
                                        return span;
                                    },
                                    // `side: 1` keeps the widget after the caret, so the
                                    // preview reads as text about to be typed. Keyed on the
                                    // text so each new guess replaces the previous DOM.
                                    { side: 1, marks: [], key: `dictation-${text}` },
                                ),
                            ]);
                        },
                    },
                }),
            ];
        },
    });

/** Preview `text` at the caret as pending dictation; `""` hides the preview. */
export const setDictationPreview = (editor: Editor | null, text: string) => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    // Interim results repeat unchanged often — don't dispatch for a no-op.
    if (dictationPreviewKey.getState(editor.state) === text) return;
    editor.view.dispatch(editor.state.tr.setMeta(SET_META, text));
};

/** Remove any pending dictation preview. */
export const clearDictationPreview = (editor: Editor | null) => setDictationPreview(editor, "");

/**
 * Insert settled dictation `text` at the caret, replacing the preview with
 * `preview` (the tail the recogniser is still working on) in the same
 * transaction — so the words never appear twice, previewed and inserted.
 */
export const commitDictationText = (editor: Editor | null, text: string, preview = "") => {
    if (!editor || editor.isDestroyed) return;
    editor
        .chain()
        .focus()
        .command(({ tr }) => {
            // insertText, not insertContent: transcripts are plain text and must
            // not be parsed as HTML. It inherits marks at the caret, like typing.
            tr.insertText(text);
            tr.setMeta(SET_META, preview);
            return true;
        })
        .run();
};
