import { Editor, JSONContent, NodePos, useEditor } from "@tiptap/react";
import { EditorElement, SaveStatus, ScreenplayElement, Style, TitlePageElement } from "../utils/enums";
import { saveScreenplay, saveTitlePage } from "../utils/requests";
import { ProjectContext, ProjectContextType } from "@src/context/ProjectContext";

import { Node } from "prosemirror-model";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { computeFullScenesData } from "./screenplay";
import { computeFullCharactersData } from "./characters";
import { useContext } from "react";
import debounce from "debounce";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import { CustomBold, CustomItalic, CustomUnderline, Page, Screenplay, ScriptElement } from "./extensions";

// ------------------------------ //
//          TEXT EDITION          //
// ------------------------------ //

export const applyMarkToggle = (editor: Editor, style: Style) => {
    if (style & Style.Bold) editor.commands.toggleBold();
    if (style & Style.Italic) editor.commands.toggleItalic();
    if (style & Style.Underline) editor.commands.toggleUnderline();
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

export const applyElement = (editor: Editor, element: EditorElement) => {
    editor.chain().focus().setNode(ScriptElement.name, { class: element }).run();
};

export const insertElement = (editor: Editor, element: ScreenplayElement, position: number) => {
    editor
        .chain()
        .insertContentAt(position, { type: ScriptElement.name, attrs: { class: element } })
        .focus(position)
        .run();
};

export const insertPage = (editor: Editor, position: number) => {
    editor.chain().insertContentAt(position, defaultPage).focus(position).run();
};

export const replaceOccurrences = (editor: Editor, oldWord: string, newWord: string) => {
    editor.chain().focus().insertContentAt({ from: 0, to: 4 }, newWord).run();
};

export const replaceScreenplay = (editor: Editor, content: JSONContent) => {
    editor.commands.setContent(content);
};

export const getStylesFromMarks = (marks: any[]): Style => {
    let style = Style.None;
    marks.forEach((mark: any) => {
        const styleClass = mark.type.name;
        if (styleClass === "bold") style |= Style.Bold;
        if (styleClass === "italic") style |= Style.Italic;
        if (styleClass === "underline") style |= Style.Underline;
    });
    return style;
};

// ------------------------------ //
//          EDITOR STATE          //
// ------------------------------ //

const EDITOR_SAVE_DELAY = 2000;
const SCENE_UPDATE_DELAY = 500;
const CHARACTERS_UPDATE_DELAY = 500;

const deferredScreenplaySave = debounce((screenplay: JSONContent, projectCtx: ProjectContextType) => {
    saveScreenplay(projectCtx, screenplay);
}, EDITOR_SAVE_DELAY);

const deferredTitlePageSave = debounce((titlePage: JSONContent, projectCtx: ProjectContextType) => {
    saveTitlePage(projectCtx, titlePage);
}, EDITOR_SAVE_DELAY);

export const deferredSceneUpdate = debounce((screenplay: JSONContent, projectCtx: ProjectContextType) => {
    computeFullScenesData(screenplay, projectCtx);
}, SCENE_UPDATE_DELAY);

export const deferredCharactersUpdate = debounce((screenplay: JSONContent, projectCtx: ProjectContextType) => {
    computeFullCharactersData(screenplay, projectCtx);
}, CHARACTERS_UPDATE_DELAY);

const processAutoComplete = (
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

export const defautElement = {
    type: ScriptElement.name,
    attrs: {
        class: "action",
    },
};

export const defaultPage = {
    type: Page.name,
    content: [defautElement],
};

export const defaultScreenplay = {
    type: Screenplay.name,
    content: [defaultPage, defaultPage],
};

const BASE_EXTENSIONS = [Screenplay, Text, History, CustomBold, CustomItalic, CustomUnderline];
export const SCREENPLAY_EXTENSIONS = [...BASE_EXTENSIONS, ScriptElement, Page];
export const TITLE_PAGE_EXTENSIONS = [...BASE_EXTENSIONS, ScriptElement];

const printNodes = (nodes: Node[]) => {
    let str = "";
    nodes.forEach((node) => {
        switch (node.type.name) {
            case "element":
                str += node.attrs.class + " ";
                break;
            case "page":
                str += "PAGE ";
                break;
            default:
                str += node.type.name + " ";
        }
    });
    console.log(str);
};

export const isOverflown = (element: HTMLElement) => {
    const parent = element.parentElement!;
    const elementHeightPos = element.offsetTop + element.offsetHeight;

    if (elementHeightPos > parent.clientHeight - 96) return true;
    return false;
};

export const useScreenplayEditor = (
    screenplay: JSONContent,
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void
) => {
    const projectCtx = useContext(ProjectContext);
    const editorView = useEditor({
        extensions: SCREENPLAY_EXTENSIONS,

        onTransaction({ editor, transaction: tr }) {
            if (tr.steps.length === 0) return;

            const { selection } = tr;
            const { $from, $to } = selection;

            const fromNodePos = new NodePos($from, editor);
            const fromNodePage = fromNodePos.closest("page")!;
            const lastNode = fromNodePage.lastChild!;
            const overflow = isOverflown(lastNode.element);

            const toNodePos = new NodePos($to, editor);
            const toNodePage = toNodePos.closest("page");
            const isSamePage = fromNodePage === toNodePage;

            const pages = editor.$nodes("page")!;

            console.log(overflow);
        },

        // update on each screenplay update
        onUpdate({ editor, transaction }) {
            const screenplay = editor.getJSON();
            projectCtx.updateSaveStatus(SaveStatus.Saving);
            deferredScreenplaySave(screenplay, projectCtx);
            deferredSceneUpdate(screenplay, projectCtx);
            deferredCharactersUpdate(screenplay, projectCtx);
        },

        onCreate({ editor }) {
            projectCtx.updateScreenplayEditor(editor as Editor);
            replaceScreenplay(editor as Editor, screenplay);
        },

        // update active on caret update
        onSelectionUpdate({ editor, transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
            const elementAnchor = anchor.parent.attrs.class;

            setActiveElement(elementAnchor, false);
            if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));

            /*processAutoComplete(
                anchor,
                projectCtx,
                editor as Editor,
                updateSuggestions,
                updateSuggestionsData
            );*/
        },
    });
    return editorView;
};

export const useTitlePageEditor = (
    titlePage: JSONContent,
    setActiveElement: (element: TitlePageElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void
) => {
    const projectCtx = useContext(ProjectContext);
    const editorView = useEditor({
        extensions: TITLE_PAGE_EXTENSIONS,

        // update on each title page update
        onUpdate({ editor }) {
            const screenplay = editor.getJSON();
            projectCtx.updateSaveStatus(SaveStatus.Saving);
            deferredTitlePageSave(screenplay, projectCtx);
        },

        onCreate({ editor }) {
            projectCtx.updateTitleEditor(editor as Editor);
            replaceScreenplay(editor as Editor, titlePage);
        },

        // update active on caret update
        onSelectionUpdate({ editor, transaction }) {
            const anchor = (transaction as any).curSelection.$anchor;
            const elementAnchor = anchor.parent.attrs.class;

            setActiveElement(elementAnchor, false);
            if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));
        },
    });
    return editorView;
};
