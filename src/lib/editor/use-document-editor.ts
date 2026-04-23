"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Editor, useEditor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap";

import { ProjectContext } from "@src/context/ProjectContext";
import { ScreenplayElement, Style, TitlePageElement } from "@src/lib/utils/enums";
import { getRandomColor } from "@src/lib/utils/misc";
import { useUser } from "@src/lib/utils/hooks";
import { getStylesFromMarks, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScriptioPagination } from "@src/lib/screenplay/extensions/pagination-extension";
import { KeybindsExtension } from "@src/lib/screenplay/extensions/keybinds-extension";
import { executeKeybindAction, KeybindId } from "@src/lib/utils/keybinds";
import {
    createCharacterHighlightExtension,
    refreshCharacterHighlights,
} from "@src/lib/screenplay/extensions/character-highlight-extension";
import {
    createSearchHighlightExtension,
    refreshSearchHighlights,
    SearchMatch,
} from "@src/lib/screenplay/extensions/search-highlight-extension";
import {
    createSceneBookmarkExtension,
    refreshSceneBookmarks,
} from "@src/lib/screenplay/extensions/scene-bookmark-extension";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { CommentMark } from "@src/lib/screenplay/extensions/comment-highlight-extension";
import { createSpellcheckExtension, refreshSpellcheck } from "@src/lib/spellcheck/spellcheck-extension";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { getActiveTitlePageElement } from "@src/lib/titlepage/editor";
import { DocumentEditorConfig } from "./document-editor-config";
import type { SuggestionData } from "@components/editor/SuggestionMenu";

export interface DocumentEditorCallbacks {
    // Screenplay-type callbacks
    setActiveElement?: (element: ScreenplayElement, applyStyle: boolean) => void;
    setSelectedStyles?: (style: Style) => void;
    updateSuggestions?: (suggestions: string[]) => void;
    updateSuggestionsData?: (data: SuggestionData) => void;
    /** Per-document: wired from useDocumentComments */
    setActiveCommentId?: (id: string | null) => void;
    userKeybinds?: Record<string, string>;
    globalContext?: { toggleFocusMode: () => void; saveProject: () => void };
    // Title-type callbacks
    setSelectedTitlePageElement?: (element: TitlePageElement) => void;
}

/**
 * Unified editor hook that replaces both useScriptioEditor and useTitlePageEditor.
 * Builds a Tiptap editor instance bound to the Y.XmlFragment specified in config.
 */
export const useDocumentEditor = (config: DocumentEditorConfig, callbacks: DocumentEditorCallbacks): Editor | null => {
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
        contdLabel,
        moreLabel,
    } = projectCtx;

    const projectState = repository?.getState();
    const features = config.features;

    // ---- Stable refs for callbacks and live data ----
    const charactersRef = useRef(characters);
    const locationsRef = useRef(locations);
    const highlightedCharactersRef = useRef<Set<string>>(highlightedCharacters);
    const scenesRef = useRef(scenes);
    const repositoryRef = useRef(repository);
    const searchTermRef = useRef<string>(searchTerm);
    const searchFiltersRef = useRef<Set<ScreenplayElement>>(searchFilters);
    const currentSearchIndexRef = useRef<number>(currentSearchIndex);
    const setSearchMatchesRef = useRef(setSearchMatches);
    const contdLabelRef = useRef<string>(contdLabel);
    const moreLabelRef = useRef<string>(moreLabel);
    const callbacksRef = useRef(callbacks);

    const [fallbackUserInfo] = useState<{ name: string; color: string }>(() => ({
        name: "User_" + Math.floor(Math.random() * 1000),
        color: getRandomColor(),
    }));
    const userInfo = useMemo(() => ({
        name: user?.username || fallbackUserInfo.name,
        color: user?.color || fallbackUserInfo.color,
    }), [user?.username, user?.color, fallbackUserInfo]);

    // Keep all refs in sync
    useEffect(() => {
        charactersRef.current = characters;
    }, [characters]);
    useEffect(() => {
        locationsRef.current = locations;
    }, [locations]);
    useEffect(() => {
        highlightedCharactersRef.current = highlightedCharacters;
    }, [highlightedCharacters]);
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
        contdLabelRef.current = contdLabel;
    }, [contdLabel]);
    useEffect(() => {
        moreLabelRef.current = moreLabel;
    }, [moreLabel]);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    // Spellcheck
    const { worker: spellWorker, isWorkerReady: isSpellWorkerReady, spellcheckLang } = useSpellcheck();
    const spellWorkerRef = useRef(spellWorker);
    const isSpellWorkerReadyRef = useRef(isSpellWorkerReady);
    useEffect(() => {
        spellWorkerRef.current = spellWorker;
    }, [spellWorker]);
    useEffect(() => {
        isSpellWorkerReadyRef.current = isSpellWorkerReady;
    }, [isSpellWorkerReady]);

    // ---- Mutable container for extension getter functions ----
    // useMemo with [] creates a stable object reference; we mutate its properties each render
    // so that extension getter closures always return the latest values without .current accesses.
    const ext = useMemo(() => ({
        highlightedCharacters,
        characters,
        scenes,
        repository,
        callbacks,
        spellWorker,
        isSpellWorkerReady,
        searchTerm,
        searchFilters,
        currentSearchIndex,
        setSearchMatches,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);
    ext.highlightedCharacters = highlightedCharacters;
    ext.characters = characters;
    ext.scenes = scenes;
    ext.repository = repository;
    ext.callbacks = callbacks;
    ext.spellWorker = spellWorker;
    ext.isSpellWorkerReady = isSpellWorkerReady;
    ext.searchTerm = searchTerm;
    ext.searchFilters = searchFilters;
    ext.currentSearchIndex = currentSearchIndex;
    ext.setSearchMatches = setSearchMatches;

    const lastReportedElementRef = useRef<ScreenplayElement | null>(null);

    const currentSuggestionsRef = useRef<string[]>([]);
    const currentSuggestionDataRef = useRef<SuggestionData | null>(null);

    // Debounced suggestion setters
    const setSuggestions = useCallback((suggestions: string[]) => {
        const cb = callbacksRef.current.updateSuggestions;
        if (!cb) return;
        const current = currentSuggestionsRef.current;
        if (suggestions.length === 0 && current.length === 0) return;
        if (suggestions.length === current.length && suggestions.every((s, i) => s === current[i])) return;
        currentSuggestionsRef.current = suggestions;
        cb(suggestions);
    }, []);

    const setSuggestionData = useCallback((data: SuggestionData) => {
        const cb = callbacksRef.current.updateSuggestionsData;
        if (!cb) return;
        const current = currentSuggestionDataRef.current;
        if (
            current &&
            current.cursor === data.cursor &&
            current.cursorInNode === data.cursorInNode &&
            current.textOffset === data.textOffset
        )
            return;
        currentSuggestionDataRef.current = data;
        cb(data);
    }, []);

    const onKeybindAction = useCallback((id: KeybindId, editorInstance: Editor) => {
        const gc = callbacks.globalContext;
        if (!gc) return;
        executeKeybindAction(id, {
            editor: editorInstance,
            toggleFocusMode: gc.toggleFocusMode,
            saveProject: gc.saveProject,
        });
    }, [callbacks.globalContext]);

    // ---- Dynamic extensions (created once, read from ext container) ----
    const characterHighlightExtension = features.characterHighlights
        ? createCharacterHighlightExtension({
              getHighlightedCharacters: () => ext.highlightedCharacters,
              getCharacterColor: (name: string) => {
                  const current = ext.characters;
                  if (!current) return undefined;
                  const upperName = name.toUpperCase();
                  const key = Object.keys(current).find((k) => k.toUpperCase() === upperName);
                  return key ? current[key]?.color : undefined;
              },
          })
        : null;

    const sceneBookmarkExtension = features.sceneBookmarks
        ? createSceneBookmarkExtension({
              getSceneColor: (sceneId: string) => {
                  const current = ext.scenes;
                  if (!current) return undefined;
                  const scene = current.find((s) => s.id === sceneId);
                  return scene?.color;
              },
          })
        : null;

    const nodeIdDedupExtension = features.nodeIdDedup
        ? createNodeIdDedupExtension({
              duplicatePersistentScene: (originalId: string, newId: string) => {
                  ext.repository?.duplicateScene(originalId, newId);
              },
          })
        : null;

    const commentMarkExtension = features.comments
        ? CommentMark.configure({
              onCommentActivated: (commentId: string | null) => {
                  ext.callbacks.setActiveCommentId?.(commentId);
              },
          })
        : null;

    const spellcheckExtension = features.spellcheck
        ? createSpellcheckExtension({
              getWorker: () => ext.spellWorker,
              getEnabled: () => ext.isSpellWorkerReady,
              getCharacters: () => ext.characters,
          })
        : null;

    const searchHighlightExtension = features.searchHighlights
        ? createSearchHighlightExtension({
              getSearchTerm: () => ext.searchTerm,
              getEnabledFilters: () => ext.searchFilters,
              getCurrentMatchIndex: () => ext.currentSearchIndex,
              onMatchesFound: (matches: SearchMatch[]) => {
                  ext.setSearchMatches(matches);
              },
          })
        : null;

    // ---- Build the editor ----
    const editor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                ...config.baseExtensions,

                // Comment mark (screenplay only, requires configured callback)
                ...(commentMarkExtension ? [commentMarkExtension] : []),

                // Collaborative editing
                ...(projectState && isYjsReady
                    ? [
                          Collaboration.configure({
                              document: projectState,
                              fragment: config.getFragment(projectState),
                          }),
                      ]
                    : []),

                // Collaboration carets
                ...(provider && isYjsReady
                    ? [
                          CollaborationCaret.configure({
                              provider,
                              user: userInfo,
                              render: (user: { color: string; name: string }) => {
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

                // Pagination
                ScriptioPagination.configure(
                    config.features.paginationMode === "screenplay"
                        ? {
                              pageGap: 20,
                              headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
                              customHeader: {
                                  1: {
                                      headerLeft: "",
                                      headerRight: `<p class="page-number" style="margin-top: 50px;"></p>`,
                                  },
                              },
                              footerRight: "",
                              ...SCREENPLAY_FORMATS[pageSize],
                          }
                        : {
                              pageGap: 20,
                              headerLeft: "",
                              headerRight: "",
                              footerLeft: "",
                              footerRight: "",
                              customHeader: {},
                              customFooter: {},
                              ...SCREENPLAY_FORMATS[pageSize],
                          },
                ),

                // Screenplay-only extensions
                ...(features.keybinds && callbacks.userKeybinds !== undefined
                    ? [
                          KeybindsExtension.configure({
                              userKeybinds: callbacks.userKeybinds || {},
                              onAction: onKeybindAction,
                          }),
                      ]
                    : []),

                ...(characterHighlightExtension ? [characterHighlightExtension] : []),
                ...(searchHighlightExtension ? [searchHighlightExtension] : []),
                ...(sceneBookmarkExtension ? [sceneBookmarkExtension] : []),
                ...(nodeIdDedupExtension ? [nodeIdDedupExtension] : []),
                ...(spellcheckExtension ? [spellcheckExtension] : []),
            ],


            onSelectionUpdate({ editor, transaction }) {
                const cb = callbacksRef.current;

                if (config.type === "screenplay") {
                    const anchor = transaction.selection.$anchor;
                    const node = anchor.parent;
                    const elementAnchor = node.attrs.class as ScreenplayElement;

                    lastReportedElementRef.current = elementAnchor;
                    cb.setActiveElement?.(elementAnchor, false);
                    if (anchor.nodeBefore) {
                        cb.setSelectedStyles?.(getStylesFromMarks([...anchor.nodeBefore.marks]));
                    }
                    if (!transaction.docChanged) {
                        setSuggestions([]);
                    }
                } else if (config.type === "title") {
                    const activeElement = getActiveTitlePageElement(editor);
                    cb.setSelectedTitlePageElement?.(activeElement);
                    const anchor = editor.state.selection.$anchor;
                    if (anchor.nodeBefore) {
                        cb.setSelectedStyles?.(getStylesFromMarks([...anchor.nodeBefore.marks]));
                    } else {
                        cb.setSelectedStyles?.(Style.None);
                    }
                }
            },

            onUpdate({ editor, transaction }) {
                if (!transaction.docChanged) return;
                if (config.type !== "screenplay") return;

                const anchor = transaction.selection.$anchor;
                const node = anchor.parent;
                const elementAnchor = node.attrs.class as ScreenplayElement;
                const nodeSize: number = node.content.size;
                const cursorInNode: number = anchor.parentOffset;
                const cursor: number = anchor.pos;

                if (!features.suggestions) return;

                if (elementAnchor === ScreenplayElement.Character) {
                    const currentCharacters = charactersRef.current;
                    if (!currentCharacters || nodeSize === 0) {
                        setSuggestions([]);
                        return;
                    }
                    if (cursorInNode !== nodeSize) {
                        setSuggestions([]);
                        return;
                    }

                    const text = node.textContent;
                    const trimmed = text.slice(0, cursorInNode).toUpperCase().trim();
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
                    const currentLocations = locationsRef.current;
                    if (!currentLocations) {
                        setSuggestions([]);
                        return;
                    }
                    if (cursorInNode !== nodeSize) {
                        setSuggestions([]);
                        return;
                    }

                    const text = node.textContent.toUpperCase();
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

            onTransaction({ editor }) {
                if (config.type !== "screenplay") return;
                const cb = callbacksRef.current;
                const { $from } = editor.state.selection;
                const currentElement = $from.parent.attrs.class as ScreenplayElement;
                if (currentElement !== lastReportedElementRef.current) {
                    lastReportedElementRef.current = currentElement;
                    cb.setActiveElement?.(currentElement, false);
                }
            },
        },
        // Rebuild the editor when Yjs readiness or the fragment changes
        [projectState, provider, isYjsReady],
    );

    // ---- Post-mount effects ----

    // Sync collaboration caret user info
    useEffect(() => {
        if (provider) {
            provider.awareness.setLocalStateField("user", userInfo);
        }
    }, [userInfo, provider]);

    // Fix Yjs undo cursor restoration: y-tiptap's stack-item-popped fires AFTER
    // the undo transaction commits, so beforeTransactionSelection is captured wrong
    // by beforeAllTransactions. Patch undo/redo to pre-set it from the stack item.
    useEffect(() => {
        if (!editor || !isYjsReady) return;

        const state = editor.state;
        const yUndoState = yUndoPluginKey.getState(state);
        const ySyncState = ySyncPluginKey.getState(state);
        if (!yUndoState?.undoManager || !ySyncState?.binding) return;

        const um = yUndoState.undoManager;
        const binding = ySyncState.binding;
        const originalUndo = um.undo.bind(um);
        const originalRedo = um.redo.bind(um);

        um.undo = () => {
            if (um.undoStack.length > 0) {
                const prevSel = um.undoStack[um.undoStack.length - 1].meta.get(binding);
                if (prevSel) binding.beforeTransactionSelection = prevSel;
            }
            return originalUndo();
        };

        um.redo = () => {
            if (um.redoStack.length > 0) {
                const prevSel = um.redoStack[um.redoStack.length - 1].meta.get(binding);
                if (prevSel) binding.beforeTransactionSelection = prevSel;
            }
            return originalRedo();
        };

        return () => {
            um.undo = originalUndo;
            um.redo = originalRedo;
        };
    }, [editor, isYjsReady]);

    // Refresh character highlights
    useEffect(() => {
        if (editor && features.characterHighlights) {
            refreshCharacterHighlights(editor);
        }
    }, [editor, highlightedCharacters, characters, features.characterHighlights]);

    // Refresh scene bookmarks
    useEffect(() => {
        if (editor && features.sceneBookmarks) {
            refreshSceneBookmarks(editor);
        }
    }, [editor, scenes, features.sceneBookmarks]);

    // Refresh search highlights
    useEffect(() => {
        if (editor && features.searchHighlights) {
            refreshSearchHighlights(editor);
        }
    }, [editor, searchTerm, searchFilters, currentSearchIndex, features.searchHighlights]);

    // Refresh spellcheck when worker becomes ready or language changes
    useEffect(() => {
        if (editor && features.spellcheck && isSpellWorkerReady) {
            refreshSpellcheck(editor);
        }
    }, [editor, isSpellWorkerReady, spellcheckLang, features.spellcheck]);

    // Sync project-level custom dictionary words to the spellcheck worker.
    // Observes the Yjs map so collaborator additions/removals are picked up too.
    useEffect(() => {
        if (!editor || !projectState || !features.spellcheck || !isSpellWorkerReady) return;

        const worker = spellWorkerRef.current;
        if (!worker) return;

        const dictMap = projectState.dictionary();

        // Send all existing custom words to the worker
        dictMap.forEach((_, word) => {
            worker.postMessage({ type: "ADD_WORD", word });
        });

        // Observe for changes (local or from collaborators)
        const observer = (event: import("yjs").YMapEvent<boolean>) => {
            const currentWorker = spellWorkerRef.current;
            if (!currentWorker) return;

            let changed = false;
            event.changes.keys.forEach((change, key) => {
                if (change.action === "add" || change.action === "update") {
                    currentWorker.postMessage({ type: "ADD_WORD", word: key });
                    changed = true;
                } else if (change.action === "delete") {
                    currentWorker.postMessage({ type: "REMOVE_WORD", word: key });
                    changed = true;
                }
            });

            if (changed && editor && !editor.isDestroyed) {
                refreshSpellcheck(editor);
            }
        };

        dictMap.observe(observer);

        return () => {
            dictMap.unobserve(observer);
        };
    }, [editor, projectState, isSpellWorkerReady, features.spellcheck]);

    return editor;
};
