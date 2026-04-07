import { Editor, getSchema, JSONContent } from "@tiptap/react";
import { ScreenplayElement, Style, TitlePageElement } from "../utils/enums";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";

import { ScreenplayNodes, ScriptioBold, ScriptioItalic, ScriptioUnderline } from "@src/lib/screenplay/nodes";
import { Placeholder } from "./extensions/placeholder-extension";
import { PAGE_SIZES } from "./extensions/pagination-extension";
import { ContdExtension } from "./extensions/contd-extension";
import { CommentMark } from "./extensions/comment-highlight-extension";
import { FountainExtension } from "./extensions/fountain-extension";

export const applyMarkToggle = (editor: Editor, style: Style) => {
    if (style & Style.Bold) editor.chain().toggleBold().focus().run();
    if (style & Style.Italic) editor.chain().toggleItalic().focus().run();
    if (style & Style.Underline) editor.chain().toggleUnderline().focus().run();
};

export const applyElement = (editor: Editor, element: ScreenplayElement) => {
    // Use the element value directly as the node name since they now match
    editor.chain().focus().setNode(element, { class: element }).run();
};

export const focusOnPosition = (editor: Editor, position: number) => {
    editor.commands.focus(position, { scrollIntoView: false });

    const { node } = editor.view.domAtPos(position);
    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
};

export const selectTextInEditor = (editor: Editor, start: number, end: number) => {
    editor.chain().focus(start).setTextSelection({ from: start, to: end }).run();
};

export const cutText = (editor: Editor, start: number, end: number) => {
    editor.commands.deleteRange({ from: start, to: end - 1 });
};

export const copyText = (editor: Editor, start: number, end: number) => {
    console.log("copy from " + start + " to " + end);
};

export const replaceRange = (editor: Editor, start: number, end: number, text: string) => {
    editor.chain().focus(start).setTextSelection({ from: start, to: end }).insertContent(text).run();
};

export const pasteText = (editor: Editor, text: string) => {
    editor.commands.insertContent(text);
};

export const pasteTextAt = (editor: Editor, text: string, position: number) => {
    editor.commands.insertContentAt(position, text);
};

export const insertElement = (editor: Editor, element: ScreenplayElement | TitlePageElement, position: number) => {
    // Use the element value directly as the node type since they now match
    const newNode = {
        type: element,
        attrs: {
            class: element,
        },
        content: [],
    };

    editor
        .chain()
        .insertContentAt(position, newNode)
        // Focus at position + 1 to ensure the cursor is inside the new empty node
        .setTextSelection(position + 1)
        .scrollIntoView() // Good practice to ensure the new line is visible
        .run();
};

export const replaceOccurrences = (editor: Editor, oldWord: string, newWord: string) => {
    const { doc, tr } = editor.state;
    const escapedWord = oldWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Collect all matches first, then replace in reverse document order
    const allMatches: { from: number; to: number }[] = [];

    doc.descendants((node, pos) => {
        if (!node.isText) return;

        const text = node.text || "";
        // Create a fresh regex for each node to avoid lastIndex issues
        const regex = new RegExp(escapedWord, "gi");
        let match;

        while ((match = regex.exec(text)) !== null) {
            allMatches.push({
                from: pos + match.index,
                to: pos + match.index + match[0].length,
            });
        }
    });

    // Sort by position descending and replace in reverse order to preserve positions
    allMatches.sort((a, b) => b.from - a.from);

    for (const { from, to } of allMatches) {
        tr.replaceWith(from, to, editor.schema.text(newWord));
    }

    if (tr.docChanged) {
        editor.view.dispatch(tr);
    }
};

export const replaceScreenplay = (editor: Editor, screenplay: JSONContent[]) => {
    editor.commands.setContent(screenplay, {
        emitUpdate: true,
    });
};

export const getStylesFromMarks = (marks: any[]): Style => {
    let style = Style.None;
    marks.forEach((mark: any) => {
        const styleClass = mark.attrs.class;
        if (styleClass === "bold") style |= Style.Bold;
        if (styleClass === "italic") style |= Style.Italic;
        if (styleClass === "underline") style |= Style.Underline;
    });
    return style;
};

export const SCREENPLAY_FORMATS = {
    LETTER: PAGE_SIZES.LETTER,
    A4: PAGE_SIZES.A4,
};

export const BASE_EXTENSIONS = [
    Text,

    ContdExtension,
    FountainExtension,

    // Individual screenplay element nodes
    ...ScreenplayNodes,

    // Mark extensions
    ScriptioBold,
    ScriptioItalic,
    ScriptioUnderline,

    Placeholder.configure({
        placeholder: "",
    }),

    Document.configure({
        // Allow any of the screenplay element types as document content
        // Action is listed first to make it the default node type for empty documents
        content: "(action|scene|character|dialogue|parenthetical|transition|section|note|dual_dialogue)+",
    }),
];

export const ScreenplaySchema = getSchema([...BASE_EXTENSIONS, CommentMark]);
