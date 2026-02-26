"use client";

import { Editor, getSchema, JSONContent, useEditor } from "@tiptap/react";
import { ScreenplayElement, Style, TitlePageElement } from "../utils/enums";
import { ProjectContext } from "@src/context/ProjectContext";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useCallback, useContext, useEffect, useRef } from "react";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import { useUser } from "../utils/hooks";
import { getRandomColor } from "../utils/misc";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";

import { ScreenplayNodes, ScriptioBold, ScriptioItalic, ScriptioUnderline } from "@src/lib/screenplay/nodes";
import { Placeholder } from "./extensions/placeholder-extension";
import { PAGE_SIZES } from "tiptap-pagination-plus";
import { PaginationPlus } from "tiptap-pagination-plus";
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
import { createSceneBookmarkExtension, refreshSceneBookmarks } from "./extensions/scene-bookmark-extension";
import { createSceneNumberRightExtension, refreshSceneNumberRight } from "./extensions/scene-number-right-extension";
import { createSceneIdDedupExtension } from "./extensions/scene-id-dedup-extension";
import { CommentMark } from "./extensions/comment-highlight-extension";
import { FountainExtension } from "./extensions/fountain-extension";
import { OrphanPreventionExtension } from "./extensions/orphan-prevention-extension";

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

//
// Elements have default bottom margins which force early unnecessary page breaks
// though there is still room for text. We extend the writable area
// by two lines (1 element + 1 bottom-margin) to have consistent layout
//
// Page-position detection is handled by PagePositionExtension (page-position-extension.ts)
// which tracks first/last nodes per page via DOM measurement after pagination layout
//

const TWO_LINE_HEIGHTS = 17 * 2;
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

export const ScreenplaySchema = getSchema([...BASE_EXTENSIONS, CommentMark]);

export const useScriptioEditor = (
    project: ProjectMembershipPayload["project"] | undefined,
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void,
    userKeybinds: Record<string, string> | undefined,
    globalContext: { toggleFocusMode: () => void; saveProject: () => void },
) => {
    const projectCtx = useContext(ProjectContext);
    const { user } = useUser();
    const {
        repository,
        provider,
        isYjsReady,
        highlightedCharacters,
        characters,
        locations,
        pageFormat: pageSize,
        scenes,
        searchTerm,
        searchFilters,
        currentSearchIndex,
        setSearchMatches,
        setActiveCommentId,
        sceneNumberOnRight,
        displaySceneNumbers,
        contdLabel,
        moreLabel,
    } = projectCtx;

    // Refs for autocomplete data
    const charactersRef = useRef(characters);
    const locationsRef = useRef(locations);
    const projectState = repository?.getState();

    // Ref to track current suggestions and avoid unnecessary state updates
    const currentSuggestionsRef = useRef<string[]>([]);
    const currentSuggestionDataRef = useRef<SuggestionData | null>(null);

    const setSuggestionData = useCallback(
        (data: SuggestionData) => {
            // Skip update if data hasn't meaningfully changed
            const current = currentSuggestionDataRef.current;
            if (
                current &&
                current.cursor === data.cursor &&
                current.cursorInNode === data.cursorInNode &&
                current.textOffset === data.textOffset
            ) {
                return;
            }
            currentSuggestionDataRef.current = data;
            updateSuggestionsData(data);
        },
        [updateSuggestionsData],
    );

    const setSuggestions = useCallback(
        (suggestions: string[]) => {
            // Skip update if suggestions haven't changed (both empty or same content)
            const current = currentSuggestionsRef.current;
            if (suggestions.length === 0 && current.length === 0) {
                return;
            }
            if (suggestions.length === current.length && suggestions.every((s, i) => s === current[i])) {
                return;
            }
            currentSuggestionsRef.current = suggestions;
            updateSuggestions(suggestions);
        },
        [updateSuggestions],
    );

    const userInfoRef = useRef({
        name: user?.username || "User_" + Math.floor(Math.random() * 1000),
        color: user?.color || getRandomColor(),
    });

    // Ref to track the last reported active element, so onTransaction can detect stale values
    const lastReportedElementRef = useRef<ScreenplayElement | null>(null);

    // Refs for character highlighting - these are read by the extension plugin
    const highlightedCharactersRef = useRef<Set<string>>(highlightedCharacters);
    const charactersDataRef = useRef(characters);

    // Ref for scene bookmarks
    const scenesRef = useRef(scenes);

    // Ref for repository (used by scene-id dedup extension)
    const repositoryRef = useRef(repository);

    // Refs for search highlighting - these are read by the search extension plugin
    const searchTermRef = useRef<string>(searchTerm);
    const searchFiltersRef = useRef<Set<ScreenplayElement>>(searchFilters);
    const currentSearchIndexRef = useRef<number>(currentSearchIndex);
    const setSearchMatchesRef = useRef(setSearchMatches);

    // Refs for right scene numbers
    const sceneNumberOnRightRef = useRef<boolean>(sceneNumberOnRight);
    const displaySceneNumbersRef = useRef<boolean>(displaySceneNumbers);

    // Ref for contd label
    const contdLabelRef = useRef<string>(contdLabel);
    const moreLabelRef = useRef<string>(moreLabel);

    // Keep refs in sync with state
    useEffect(() => {
        highlightedCharactersRef.current = highlightedCharacters;
    }, [highlightedCharacters]);

    useEffect(() => {
        charactersDataRef.current = characters;
    }, [characters]);

    useEffect(() => {
        charactersRef.current = characters;
    }, [characters]);

    useEffect(() => {
        locationsRef.current = locations;
    }, [locations]);

    useEffect(() => {
        scenesRef.current = scenes;
    }, [scenes]);

    useEffect(() => {
        repositoryRef.current = repository;
    }, [repository]);

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
        sceneNumberOnRightRef.current = sceneNumberOnRight;
    }, [sceneNumberOnRight]);

    useEffect(() => {
        displaySceneNumbersRef.current = displaySceneNumbers;
    }, [displaySceneNumbers]);

    useEffect(() => {
        contdLabelRef.current = contdLabel;
    }, [contdLabel]);

    useEffect(() => {
        moreLabelRef.current = moreLabel;
    }, [moreLabel]);

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

    // Create the scene bookmark extension with callback that reads from ref
    const sceneBookmarkExtension = createSceneBookmarkExtension({
        getSceneColor: (sceneId: string) => {
            const current = scenesRef.current;
            if (!current) return undefined;
            const scene = current.find((s) => s.id === sceneId);
            return scene?.color;
        },
    });

    // Create the scene-id dedup extension to handle paste of persistent scenes
    const sceneIdDedupExtension = createSceneIdDedupExtension({
        duplicatePersistentScene: (originalId: string, newId: string) => {
            repositoryRef.current?.duplicateScene(originalId, newId);
        },
    });

    // Create the comment mark extension
    const commentMarkExtension = CommentMark.configure({
        onCommentActivated: (commentId: string | null) => {
            setActiveCommentId(commentId);
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

    // Create the scene number right extension with callback that checks both settings
    const sceneNumberRightExtension = createSceneNumberRightExtension({
        isEnabled: () => sceneNumberOnRightRef.current && displaySceneNumbersRef.current,
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
                              fragment: projectState.screenplayFragment(),
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
                OrphanPreventionExtension.configure({
                    getContdLabel: () => contdLabelRef.current,
                    getMoreLabel: () => moreLabelRef.current
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
                sceneBookmarkExtension,
                sceneNumberRightExtension,
                sceneIdDedupExtension,
                commentMarkExtension,
            ],

            onSelectionUpdate({ editor, transaction }) {
                const anchor = (transaction as any).curSelection.$anchor;
                const node = anchor.parent;
                const elementAnchor = node.attrs.class as ScreenplayElement;

                lastReportedElementRef.current = elementAnchor;
                setActiveElement(elementAnchor, false);
                if (anchor.nodeBefore) setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks));

                // Clear suggestions when moving cursor (not typing)
                // onUpdate will handle showing suggestions when typing
                if (!transaction.docChanged) {
                    setSuggestions([]);
                }
            },

            onUpdate({ editor, transaction }) {
                // Only show autocomplete when document content changes (typing)
                if (!transaction.docChanged) return;

                const anchor = (transaction as any).curSelection.$anchor;
                const node = anchor.parent;
                const elementAnchor = node.attrs.class as ScreenplayElement;

                const nodeSize: number = node.content.size;
                const cursorInNode: number = anchor.parentOffset;
                const cursor: number = anchor.pos;

                // Character autocomplete
                if (elementAnchor === ScreenplayElement.Character) {
                    const currentCharacters = charactersRef.current;

                    // Skip if no characters or node is empty
                    if (!currentCharacters || nodeSize === 0) {
                        setSuggestions([]);
                        return;
                    }

                    // Only show suggestions when cursor is at the end of the text
                    if (cursorInNode !== nodeSize) {
                        setSuggestions([]);
                        return;
                    }

                    const text = node.textContent;
                    const trimmed: string = text.slice(0, cursorInNode).toUpperCase().trim();
                    // Clean the current text the same way getCharacterNames does,
                    // so we can exclude the currently-typed name from suggestions
                    const currentCleanName = trimmed.replace(/\s*\(.*?\)\s*$/, "").trim();
                    const suggestions = Object.keys(currentCharacters)
                        .filter((name) => {
                            const upperName = name.toUpperCase();
                            return (
                                upperName !== currentCleanName &&
                                upperName.startsWith(trimmed) &&
                                upperName !== text.toUpperCase().trim()
                            );
                        })
                        .slice(0, 10);

                    if (suggestions.length > 0) {
                        const pagePos = editor.view.coordsAtPos(cursor);
                        setSuggestionData({
                            position: { x: pagePos.left, y: pagePos.top },
                            cursor,
                            cursorInNode,
                            nodeType: "character",
                        });
                    }
                    setSuggestions(suggestions);
                } else if (elementAnchor === ScreenplayElement.Scene) {
                    // Scene/Location autocomplete
                    const currentLocations = locationsRef.current;
                    if (!currentLocations) {
                        setSuggestions([]);
                        return;
                    }

                    // Only show suggestions when cursor is at the end
                    if (cursorInNode !== nodeSize) {
                        setSuggestions([]);
                        return;
                    }

                    const text = node.textContent.toUpperCase();

                    // Check if we're after a prefix like "INT. " or "EXT. "
                    const prefixMatch = text.match(/^(INT\. |EXT\. |INT\/EXT\. |I\/E\. )\s*/i);
                    if (!prefixMatch) {
                        setSuggestions([]);
                        return;
                    }

                    const prefixLength = prefixMatch[0].length;
                    const afterPrefix = text.slice(prefixLength);
                    let suggestions = Object.keys(currentLocations);

                    if (afterPrefix.length > 0) {
                        const cleanAfterPrefix = afterPrefix.trim();
                        suggestions = suggestions
                            .filter((location) => {
                                const upperLocation = location.toUpperCase();
                                return upperLocation.startsWith(afterPrefix) && upperLocation !== cleanAfterPrefix;
                            })
                            .slice(0, 10);
                    } else {
                        suggestions = suggestions.slice(0, 10);
                    }

                    if (suggestions.length > 0) {
                        // Use side=-1 to get coordinates at the text cursor position,
                        // not after any widget decorations (scene number) at the same pos
                        const pagePos = editor.view.coordsAtPos(cursor, -1);
                        setSuggestionData({
                            position: { x: pagePos.left, y: pagePos.top },
                            cursor,
                            cursorInNode,
                            textOffset: prefixLength,
                            nodeType: "scene",
                        });
                    }
                    setSuggestions(suggestions);
                } else {
                    setSuggestions([]);
                }
            },

            onTransaction({ editor, transaction }) {
                // Catch element type changes from appendTransaction (e.g. Fountain extension
                // transforming an Action into a Scene Heading) that onSelectionUpdate misses,
                // since onSelectionUpdate fires before appendTransaction processes.
                const { $from } = editor.state.selection;
                const currentElement = $from.parent.attrs.class as ScreenplayElement;
                if (currentElement !== lastReportedElementRef.current) {
                    lastReportedElementRef.current = currentElement;
                    setActiveElement(currentElement, false);
                }
            },
        },
        [projectState, provider, isYjsReady],
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

    // Refresh scene bookmarks when scenes change
    useEffect(() => {
        if (scriptioEditor) {
            refreshSceneBookmarks(scriptioEditor);
        }
    }, [scriptioEditor, scenes]);

    // Refresh right scene numbers when settings change
    useEffect(() => {
        if (scriptioEditor) {
            refreshSceneNumberRight(scriptioEditor);
        }
    }, [scriptioEditor, sceneNumberOnRight, displaySceneNumbers]);

    // Refresh search highlights when search state changes
    useEffect(() => {
        if (scriptioEditor) {
            refreshSearchHighlights(scriptioEditor);
        }
    }, [scriptioEditor, searchTerm, searchFilters, currentSearchIndex]);

    // Sync editor page size when pageFormat changes (e.g., from another collaborator)
    useEffect(() => {
        if (!scriptioEditor || scriptioEditor.isDestroyed || !scriptioEditor.view) return;
        try {
            const format = SCREENPLAY_FORMATS[pageSize];
            // 1. Bypass PaginationPlus Reference Bug
            // `tiptap-pagination-plus` loses the reference to its TipTap bound `storage` internally.
            // When `updatePageSize` is called, it mutates the wrong object. We must mutate the bound object directly.
            const storage = scriptioEditor.storage.PaginationPlus;
            if (storage) {
                storage.pageHeight = format.pageHeight;
                storage.pageWidth = format.pageWidth;
                storage.marginTop = format.marginTop;
                storage.marginBottom = format.marginBottom;
                storage.marginLeft = format.marginLeft;
                storage.marginRight = format.marginRight;
            }

            // 2. Set the custom layout variable used by our frontend (e.g., for bookmarks)
            const dom = scriptioEditor.view.dom as HTMLElement;
            if (dom) {
                dom.style.setProperty("--page-margin-left", `${format.marginLeft}px`);
                
                // 3. Force ProseMirror to flush/repaint its view to catch dynamic dimensions
                scriptioEditor.commands.command(({ tr, dispatch }) => {
                    if (dispatch) {
                        tr.setMeta("pageFormatUpdate", true);
                        dispatch(tr);
                    }
                    return true;
                });
            }
        } catch {
            // Editor view not mounted yet — will apply on next render
        }
    }, [scriptioEditor, pageSize]);

    // Force orphan prevention element update when labels change
    useEffect(() => {
        if (!scriptioEditor || scriptioEditor.isDestroyed || !scriptioEditor.view) return;
        scriptioEditor.commands.forceOrphanUpdate();
    }, [scriptioEditor, contdLabel, moreLabel]);

    return scriptioEditor;
};
