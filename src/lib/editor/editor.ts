import { Editor } from "@tiptap/react";

export const focusOnPosition = (editorView: Editor, position: number) => {
    editorView.commands.focus(position);
};

export const selectTextInEditor = (editorView: Editor, start: number, end: number) => {
    editorView.chain().focus(start).setTextSelection({ from: start, to: end }).run();
};

export const cutTextSelection = (editorView: Editor, start: number, end: number) => {
    editorView.commands.deleteRange({ from: start, to: end - 1 });
};

export const copyTextSelection = (editorView: Editor, start: number, end: number) => {
    console.log("copy from " + start + " to " + end);
    //editorView?.state.doc.copy();
};

export const replaceRange = (editorView: Editor, start: number, end: number, text: string) => {
    editorView.chain().focus(start).setTextSelection({ from: start, to: end }).insertContent(text).run();
};

export const pasteText = (editorView: Editor, text: string) => {
    editorView.commands.insertContent(text);
};

export const pasteTextAt = (editorView: Editor, text: string, position: number) => {
    editorView.commands.insertContentAt(position, text);
};
