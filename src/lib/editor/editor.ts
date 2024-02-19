import { Editor, useEditor } from "@tiptap/react";
import { SaveStatus, ScreenplayElement, Style } from "../utils/enums";
import { saveScreenplay } from "../utils/requests";
import { ProjectContext, ProjectContextType } from "@src/context/ProjectContext";

import { CustomBold, CustomItalic, CustomUnderline, Screenplay } from "@src/Screenplay";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { computeFullScenesData } from "./screenplay";
import { computeFullCharactersData } from "./characters";
import { useContext } from "react";
import debounce from "debounce";
import { SuggestionData } from "@components/editor/SuggestionMenu";

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

export const replaceOccurrences = (editor: Editor, oldWord: string, newWord: string) => {
    editor.chain().focus().insertContentAt({ from: 0, to: 4 }, newWord).run();
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

export const save = async (screenplay: any, projectCtx: ProjectContextType) => {
    console.log("Saving screenplay");

    if (projectCtx.saveStatus !== SaveStatus.Saved) {
        projectCtx.updateSaveStatus(SaveStatus.Saving);
        const res = await saveScreenplay(projectCtx.project!.id, screenplay, projectCtx.charactersData);

        if (!res.ok) {
            projectCtx.updateSaveStatus(SaveStatus.Error);
            return;
        }
        projectCtx.updateSaveStatus(SaveStatus.Saved);
    }
};

const SCREENPLAY_SAVE_DELAY = 2000;
const deferredScreenplaySave = debounce((screenplay: any, projectCtx: ProjectContextType) => {
    save(screenplay, projectCtx);
}, SCREENPLAY_SAVE_DELAY);

const SCENE_UPDATE_DELAY = 500;
const deferredSceneUpdate = debounce((screenplay: any, projectCtx: ProjectContextType) => {
    computeFullScenesData(screenplay, projectCtx);
}, SCENE_UPDATE_DELAY);

const CHARACTERS_UPDATE_DELAY = 500;
const deferredCharactersUpdate = debounce((screenplay: any, projectCtx: ProjectContextType) => {
    computeFullCharactersData(screenplay, projectCtx);
}, CHARACTERS_UPDATE_DELAY);

const triggerEditorSave = (projectCtx: ProjectContextType, screenplay: any) => {
    // Set as unsaved, to prevent data loss between typing and autosave
    projectCtx.updateSaveStatus(SaveStatus.NotSaved);
    deferredSceneUpdate(screenplay, projectCtx);
    deferredCharactersUpdate(screenplay, projectCtx);
    deferredScreenplaySave(screenplay, projectCtx);
};

const onAutoComplete = (
    anchor: any,
    projectCtx: ProjectContextType,
    editor: Editor,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionData: (data: SuggestionData) => void
) => {
    const nodeAnchor = anchor.parent;
    const elementAnchor = nodeAnchor.attrs.class;
    const nodeSize: number = nodeAnchor.content.size;
    const cursorInNode: number = anchor.parentOffset;

    // Character autocompletion
    if (elementAnchor === ScreenplayElement.Character) {
        const cursor: number = anchor.pos;
        const pagePos = editor.view.coordsAtPos(cursor);

        let list = Object.keys(projectCtx.charactersData);

        if (nodeSize > 0) {
            if (cursorInNode !== nodeSize) {
                updateSuggestions([]);
                return;
            }

            const text = nodeAnchor.textContent;
            const trimmed: string = text.slice(0, cursorInNode).toLowerCase();
            list = list
                .filter((name) => {
                    const name_ = name.toLowerCase();
                    return name_ !== trimmed && name_.startsWith(trimmed) && name_ !== text;
                })
                .slice(0, 5);
        }

        const displaySuggestions = (list: string[], data: SuggestionData) => {
            updateSuggestions(list);
            updateSuggestionData(data);
        };

        displaySuggestions(list, {
            position: { x: pagePos.left, y: pagePos.top },
            cursor,
            cursorInNode,
        });
    } else if (elementAnchor === ScreenplayElement.Scene) {
        // TODO: Autocompletion for scenes
    }
};

export const useScriptioEditor = (
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void
) => {
    const projectCtx = useContext(ProjectContext);
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

        // update on each screenplay update
        onUpdate({ editor }) {
            const screenplay = editor.getJSON();
            triggerEditorSave(projectCtx, screenplay);
        },

        // update active on caret update
        onSelectionUpdate({ editor, transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
            const elementAnchor = anchor.parent.attrs.class;

            setActiveElement(elementAnchor, false);
            if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));

            onAutoComplete(anchor, projectCtx, editor as Editor, updateSuggestions, updateSuggestionsData);
        },
    });
    return editorView;
};
