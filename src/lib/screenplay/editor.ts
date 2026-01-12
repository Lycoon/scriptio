"use client";

import { Editor, useEditor } from "@tiptap/react";
import { ScreenplayElement, Style } from "../utils/enums";
import { ProjectContext } from "@src/context/ProjectContext";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useContext, useEffect, useRef } from "react";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import { useUser } from "../utils/hooks";
import { getRandomColor } from "../utils/misc";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Screenplay } from "../utils/types";
import debounce from "debounce";

import * as Node from "@src/Screenplay";
import { Placeholder } from "./placeholder-extension";
import { PAGE_SIZES, PaginationPlus } from "tiptap-pagination-plus";
import { KeybindsExtension } from "./keybinds-extension";
import { executeKeybindAction } from "../utils/keybinds";
import { ContdExtension } from "./contd-extension";

export const applyMarkToggle = (editor: Editor, style: Style) => {
    if (style & Style.Bold) editor.chain().toggleBold().focus().run();
    if (style & Style.Italic) editor.chain().toggleItalic().focus().run();
    if (style & Style.Underline) editor.chain().toggleUnderline().focus().run();
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
    const newNode = {
        type: "Screenplay",
        attrs: {
            class: element,
        },
        content: [],
    };

    editor.chain().insertContentAt(position, newNode).focus(position).run();
};

export const replaceOccurrences = (editor: Editor, oldWord: string, newWord: string) => {
    editor.chain().focus().insertContentAt({ from: 0, to: 4 }, newWord).run();
};

export const replaceScreenplay = (editor: Editor, screenplay: Screenplay) => {
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

//
// Elements have default bottom margins which force early unnecessary page breaks
// though there is still room for text. We extend the writable area
// by two lines (1 element + 1 bottom-margin) to have consistent layout
//
// TODO: Update tiptap-pagination-plus to ignore margin overflows or store in node whether it is
// last of its page (could be extended for CONT'D feature)
//

const TWO_LINE_HEIGHTS = 17 * 3;
export const SCREENPLAY_FORMATS = {
    Letter: {
        marginBottom: 96 - TWO_LINE_HEIGHTS,
        marginLeft: 144,
        marginRight: 96,
        pageHeight: PAGE_SIZES.LETTER.pageHeight,
        pageWidth: PAGE_SIZES.LETTER.pageWidth,
    },
    A4: {
        marginBottom: 144 - TWO_LINE_HEIGHTS,
        marginLeft: 125,
        marginRight: 86,
        pageHeight: PAGE_SIZES.A4.pageHeight,
        pageWidth: PAGE_SIZES.A4.pageWidth,
    },
};

export const BASE_EXTENSIONS = [
    Document.configure({
        content: "Screenplay+",
    }),
    Text,
    Node.Screenplay,
    Node.CustomBold,
    Node.CustomItalic,
    Node.CustomUnderline,
];

const EXTENSIONS = [
    ...BASE_EXTENSIONS,
    Placeholder.configure({
        placeholder: "",
    }),
    ContdExtension,
    PaginationPlus.configure({
        marginTop: 0,
        pageGap: 20,
        contentMarginTop: 31, // Header is 68px height (1in = 96px = 31px + 68px)
        headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
        customHeader: {
            1: {
                headerLeft: "",
                headerRight: `<p class="page-number" style="margin-top: 50px;"></p>`,
            },
        },
        footerRight: "",
        ...SCREENPLAY_FORMATS.Letter,
    }),
];

export const useScriptioEditor = (
    project: ProjectMembershipPayload["project"] | undefined,
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void,
    userKeybinds: Record<string, string> | undefined,
    globalContext: { toggleFocusMode: () => void; saveProject: () => void }
) => {
    const projectCtx = useContext(ProjectContext);
    const { user } = useUser();
    const { ydoc, provider, isYjsReady } = projectCtx;

    const debouncedUpdateRef = useRef(
        debounce((editor: Editor) => {
            console.log("Updating screenplay...");
            const screenplay = editor.getJSON();
            projectCtx.updateScreenplay(screenplay);
        }, 300)
    );

    const userInfoRef = useRef({
        name: user?.username || "User_" + Math.floor(Math.random() * 1000),
        color: user?.color || getRandomColor(),
    });

    useEffect(() => {
        userInfoRef.current = {
            name: user?.username || userInfoRef.current.name,
            color: user?.color || userInfoRef.current.color,
        };
        if (provider) {
            provider.awareness.setLocalStateField("user", userInfoRef.current);
        }
    }, [user?.username, user?.color, provider]);

    const scriptioEditor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                ...EXTENSIONS,
                ...(ydoc && isYjsReady
                    ? [
                          Collaboration.configure({
                              document: ydoc,
                              fragment: ydoc.getXmlFragment("screenplay"),
                          }),
                      ]
                    : []),
                ...(provider && isYjsReady
                    ? [
                          CollaborationCaret.configure({
                              provider: provider,
                              user: userInfoRef.current,
                              render: (user: any) => {
                                  const caret = document.createElement("span");
                                  caret.classList.add("collab-caret");
                                  caret.style.borderLeft = `2px solid ${user.color}`;
                                  const label = document.createElement("div");
                                  label.classList.add("collab-caret-label");
                                  label.style.backgroundColor = user.color;
                                  label.innerText = user.name;
                                  label.contentEditable = "false";
                                  caret.appendChild(label);
                                  return caret;
                              },
                          }),
                      ]
                    : []),
                KeybindsExtension.configure({
                    userKeybinds: userKeybinds || {},
                    onAction: (id, editorInstance) => {
                        executeKeybindAction(id, {
                            editor: editorInstance,
                            toggleFocusMode: globalContext.toggleFocusMode,
                            saveProject: globalContext.saveProject,
                        });
                    },
                }),
            ],

            onUpdate({ editor }) {
                debouncedUpdateRef.current(editor);
            },

            onSelectionUpdate({ editor, transaction }) {
                const anchor = (transaction as any).curSelection.$anchor;
                const elementAnchor = anchor.parent.attrs.class;

                setActiveElement(elementAnchor, false);
                if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));
            },
        },
        [ydoc, provider, isYjsReady]
    );

    useEffect(() => {
        if (scriptioEditor) {
            projectCtx.updateEditor(scriptioEditor);
        }
        return () => {
            projectCtx.updateEditor(null);
        };
    }, [scriptioEditor]);

    return scriptioEditor;
};
