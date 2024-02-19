import { Content, Editor, useEditor } from "@tiptap/react";
import { SaveStatus, ScreenplayElement, Style } from "../utils/enums";
import { saveScreenplay } from "../utils/requests";
import { ProjectContextType } from "@src/context/ProjectContext";

import { CustomBold, CustomItalic, CustomUnderline, Screenplay } from "@src/Screenplay";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { Project } from "../utils/types";

// ------------------------------ //
//          TEXT EDITION          //
// ------------------------------ //

export const applyMarkToggle = (editor: Editor, style: Style) => {
    if (style & Style.Bold) editor.commands.toggleBold();
    if (style & Style.Italic) editor.commands.toggleItalic();
    if (style & Style.Underline) editor.commands.toggleUnderline();
};

export const applyElement = (editor: Editor, element: ScreenplayElement) => {
    editor.chain().focus().setNode("Screenplay", { class: element }).run();
};

export const focusOnPosition = (editor: Editor, position: number) => {
    editor.commands.focus(position);
};

export const selectTextInEditor = (editor: Editor, start: number, end: number) => {
    editor.chain().focus(start).setTextSelection({ from: start, to: end }).run();
};

export const cutText = (editor: Editor, start: number, end: number) => {
    editor.commands.deleteRange({ from: start, to: end - 1 });
};

export const copyText = (editor: Editor, start: number, end: number) => {
    console.log("copy from " + start + " to " + end);
    //editor?.state.doc.copy();
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

export const insertElement = (editor: Editor, element: ScreenplayElement, position: number) => {
    editor.chain().insertContentAt(position, `<p class="${element}"></p>`).focus(position).run();
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

// ------------------------------ //
//          EDITOR STATE          //
// ------------------------------ //

export const save = async (projectId: string, screenplay: any, ctx: ProjectContextType) => {
    if (ctx.saveStatus !== SaveStatus.Saved) {
        ctx.updateSaveStatus(SaveStatus.Saving);
        const res = await saveScreenplay(projectId, screenplay, ctx.charactersData);

        if (!res.ok) {
            ctx.updateSaveStatus(SaveStatus.Error);
            return;
        }

        ctx.updateSaveStatus(SaveStatus.Saved);
    }
};

export const useScriptioEditor = (project: Project, triggerEditorUpdate: () => void, onCaretUpdate: () => void) => {
    const editorView = useEditor({
        extensions: [
            // default
            Document,
            Text,
            History,
            CustomBold,
            CustomItalic,
            CustomUnderline,

            // scriptio
            Screenplay,
        ],
        content: project.screenplay as Content,

        // update on each screenplay update
        onUpdate({ editor, transaction }) {
            triggerEditorUpdate();
        },

        // update active on caret update
        onSelectionUpdate({ editor, transaction }) {
            const selection = (transaction as any).curSelection;
            onCaretUpdate(editor as Editor, selection);
        },
    });
    return editorView;
};
