"use client";

import { Editor, getSchema, JSONContent, useEditor } from "@tiptap/react";
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

import { ScreenplayNodes, ScriptioBold, ScriptioItalic, ScriptioUnderline } from "@src/lib/screenplay/nodes";
import { Placeholder } from "./extensions/placeholder-extension";
import { PAGE_SIZES, PaginationPlus } from "tiptap-pagination-plus";
import { KeybindsExtension } from "./extensions/keybinds-extension";
import { executeKeybindAction } from "../utils/keybinds";
import { ContdExtension } from "./extensions/contd-extension";
import {
    createCharacterHighlightExtension,
    refreshCharacterHighlights,
} from "./extensions/character-highlight-extension";
import {
    createSearchHighlightExtension,
    refreshSearchHighlights,
    SearchMatch,
} from "./extensions/search-highlight-extension";
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
    editor.commands.focus(position);

    // Scroll the view to center on the focused position
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

export const insertElement = (editor: Editor, element: ScreenplayElement, position: number) => {
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
    LETTER: {
        marginTop: 0,
        marginBottom: 96 - TWO_LINE_HEIGHTS,
        marginLeft: 144,
        marginRight: 96,
        pageHeight: PAGE_SIZES.LETTER.pageHeight,
        pageWidth: PAGE_SIZES.LETTER.pageWidth,
    },
    A4: {
        marginTop: 0,
        marginBottom: 144 - TWO_LINE_HEIGHTS,
        marginLeft: 125,
        marginRight: 86,
        pageHeight: PAGE_SIZES.A4.pageHeight,
        pageWidth: PAGE_SIZES.A4.pageWidth,
    },
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
        content: "(action|scene|character|dialogue|parenthetical|transition|section|note)+",
    }),
];

export const ScreenplaySchema = getSchema(BASE_EXTENSIONS);

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
    const {
        repository,
        provider,
        isYjsReady,
        highlightedCharacters,
        characters,
        pageFormat: pageSize,
        searchTerm,
        searchFilters,
        currentSearchIndex,
        setSearchMatches,
    } = projectCtx;
    const projectState = repository?.getState();

    const userInfoRef = useRef({
        name: user?.username || "User_" + Math.floor(Math.random() * 1000),
        color: user?.color || getRandomColor(),
    });

    // Refs for character highlighting - these are read by the extension plugin
    const highlightedCharactersRef = useRef<Set<string>>(highlightedCharacters);
    const charactersDataRef = useRef(characters);

    // Refs for search highlighting - these are read by the search extension plugin
    const searchTermRef = useRef<string>(searchTerm);
    const searchFiltersRef = useRef<Set<ScreenplayElement>>(searchFilters);
    const currentSearchIndexRef = useRef<number>(currentSearchIndex);
    const setSearchMatchesRef = useRef(setSearchMatches);

    // Keep refs in sync with state
    useEffect(() => {
        highlightedCharactersRef.current = highlightedCharacters;
    }, [highlightedCharacters]);

    useEffect(() => {
        charactersDataRef.current = characters;
    }, [characters]);

    useEffect(() => {
        searchTermRef.current = searchTerm;
    }, [searchTerm]);

    useEffect(() => {
        searchFiltersRef.current = searchFilters;
    }, [searchFilters]);

    useEffect(() => {
        currentSearchIndexRef.current = currentSearchIndex;
    }, [currentSearchIndex]);

    useEffect(() => {
        setSearchMatchesRef.current = setSearchMatches;
    }, [setSearchMatches]);

    useEffect(() => {
        userInfoRef.current = {
            name: user?.username || userInfoRef.current.name,
            color: user?.color || userInfoRef.current.color,
        };
        if (provider) {
            provider.awareness.setLocalStateField("user", userInfoRef.current);
        }
    }, [user?.username, user?.color, provider]);

    // Create the character highlight extension with callback functions that read from refs
    const characterHighlightExtension = createCharacterHighlightExtension({
        getHighlightedCharacters: () => highlightedCharactersRef.current,
        getCharacterColor: (name: string) => {
            const current = charactersDataRef.current;
            if (!current) return undefined;
            const upperName = name.toUpperCase();
            const key = Object.keys(current).find((k) => k.toUpperCase() === upperName);
            return key ? current[key]?.color : undefined;
        },
    });

    // Create the search highlight extension with callback functions that read from refs
    const searchHighlightExtension = createSearchHighlightExtension({
        getSearchTerm: () => searchTermRef.current,
        getEnabledFilters: () => searchFiltersRef.current,
        getCurrentMatchIndex: () => currentSearchIndexRef.current,
        onMatchesFound: (matches: SearchMatch[]) => {
            setSearchMatchesRef.current(matches);
        },
    });

    const scriptioEditor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                ...BASE_EXTENSIONS,
                ...(projectState && isYjsReady
                    ? [
                          Collaboration.configure({
                              document: projectState,
                              fragment: projectState.getXmlFragment("screenplay"),
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
                PaginationPlus.configure({
                    pageGap: 20,
                    contentMarginTop: 31, // Header is 68px height (1in = 96px = 31px + 68px)
                    headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
                    customHeader: {
                        1: {
                            // Overwrite first page header with empty header
                            headerLeft: "",
                            headerRight: `<p class="page-number" style="margin-top: 50px;"></p>`,
                        },
                    },
                    footerRight: "",
                    ...SCREENPLAY_FORMATS[pageSize],
                }),
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
                characterHighlightExtension,
                searchHighlightExtension,
            ],

            onSelectionUpdate({ editor, transaction }) {
                const anchor = (transaction as any).curSelection.$anchor;
                const elementAnchor = anchor.parent.attrs.class;

                setActiveElement(elementAnchor, false);
                if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));
            },
        },
        [projectState, provider, isYjsReady]
    );

    useEffect(() => {
        if (scriptioEditor) {
            projectCtx.updateEditor(scriptioEditor);
        }
        return () => {
            projectCtx.updateEditor(null);
        };
    }, [scriptioEditor]);

    // Refresh character highlights when highlighted characters or character colors change
    useEffect(() => {
        if (scriptioEditor) {
            refreshCharacterHighlights(scriptioEditor);
        }
    }, [scriptioEditor, highlightedCharacters, characters]);

    // Refresh search highlights when search state changes
    useEffect(() => {
        if (scriptioEditor) {
            refreshSearchHighlights(scriptioEditor);
        }
    }, [scriptioEditor, searchTerm, searchFilters, currentSearchIndex]);

    // Sync editor page size when pageFormat changes (e.g., from another collaborator)
    useEffect(() => {
        if (scriptioEditor) {
            scriptioEditor.chain().focus().updatePageSize(SCREENPLAY_FORMATS[pageSize]).run();
        }
    }, [scriptioEditor, pageSize]);

    return scriptioEditor;
};
