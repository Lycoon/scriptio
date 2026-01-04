import { Editor, JSONContent, useEditor } from "@tiptap/react";
import { ScreenplayElement, Style } from "../utils/enums";
import { ProjectContext, ProjectContextType } from "@src/context/ProjectContext";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { computeFullScenesData } from "./screenplay";
import { computeFullCharactersData } from "./characters";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import debounce from "debounce";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { removeAwarenessStates } from "@node_modules/y-protocols/awareness";
import { useSettings } from "../utils/hooks";
import { getRandomColor } from "../utils/misc";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { getCloudToken } from "../utils/requests";
import { Screenplay } from "../utils/types";

import * as Node from "@src/Screenplay";
import { ThrottledWebsocketProvider } from "../collaboration/utils";
import { Placeholder } from "./placeholder-extension";
import { PAGE_SIZES, PaginationPlus } from "@node_modules/tiptap-pagination-plus/dist";
import { KeybindsExtension } from "./keybinds-extension";
import { executeAction } from "../utils/settings";

// ------------------------------ //
//          TEXT EDITION          //
// ------------------------------ //

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

export const replaceScreenplay = (editor: Editor, screenplay: JSONContent) => {
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

// ------------------------------ //
//          EDITOR STATE          //
// ------------------------------ //

export const SCREENPLAYER_PAPER_FORMATS = {
    Letter: {
        marginBottom: 96, // 1in
        marginLeft: 144, // 1.5in
        marginRight: 96, // 1in
        pageHeight: PAGE_SIZES.LETTER.pageHeight,
        pageWidth: PAGE_SIZES.LETTER.pageWidth,
    },
    A4: {
        marginBottom: 144, // 1.5in
        marginLeft: 125, // 1.3in
        marginRight: 86, // 0.9in
        pageHeight: PAGE_SIZES.A4.pageHeight,
        pageWidth: PAGE_SIZES.A4.pageWidth,
    },
};

export const SCRIPTIO_EXTENSIONS = [
    Document.configure({
        content: "Screenplay+",
    }),
    Placeholder.configure({
        placeholder: "",
    }),
    PaginationPlus.configure({
        // Default Settings
        marginTop: 0,
        pageGap: 20,
        headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
        footerRight: "",
        // Paper Format Dependent Settings
        ...SCREENPLAYER_PAPER_FORMATS.Letter,
    }),
    Text,
    Node.Screenplay,
    Node.CustomBold,
    Node.CustomItalic,
    Node.CustomUnderline,
];

const SCREENPLAY_SAVE_DELAY = 2000;
const SCENE_UPDATE_DELAY = 500;
const CHARACTERS_UPDATE_DELAY = 500;

export const deferredSceneUpdate = debounce((screenplay: Screenplay, projectCtx: ProjectContextType) => {
    computeFullScenesData(screenplay, projectCtx);
}, SCENE_UPDATE_DELAY);

export const deferredCharactersUpdate = debounce((screenplay: Screenplay, projectCtx: ProjectContextType) => {
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

const useLocal = (projectId: string) => {
    const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
    const [isLocalReady, setIsLocalReady] = useState(false);

    useEffect(() => {
        if (!projectId) return;

        const doc = new Y.Doc();
        const localProvider = new IndexeddbPersistence(projectId, doc);

        localProvider.on("synced", () => {
            console.log("Local IndexedDB synced");
            setIsLocalReady(true);
        });

        setYdoc(doc);

        return () => {
            localProvider.destroy();
            doc.destroy();
        };
    }, [projectId]);

    return { ydoc, isLocalReady };
};

const useCloud = (projectId: string, doc: Y.Doc | null) => {
    const { updateConnectionStatus } = useContext(ProjectContext);
    const [users, setUsers] = useState<any[]>([]);

    // Create provider synchronously - it will connect asynchronously
    const [provider, setProvider] = useState<ThrottledWebsocketProvider | null>(null);
    const isMountedRef = useRef(true);

    // Stable function to refresh token and reconnect
    const refreshAndReconnect = useCallback(async () => {
        if (!provider || !projectId) return;

        try {
            const token = await getCloudToken(projectId);
            if (token && isMountedRef.current) {
                await provider.updateToken(token);
            }
        } catch (e) {
            console.warn("Failed to refresh token:", e);
        }
    }, [provider, projectId]);

    // Create provider when doc is ready
    useEffect(() => {
        isMountedRef.current = true;

        if (!doc || !projectId) {
            updateConnectionStatus("disconnected");
            return;
        }

        // If provider already exists for this doc, don't recreate
        if (provider) {
            return;
        }

        const initializeProvider = async () => {
            console.log("Initializing cloud provider...");
            updateConnectionStatus("connecting");

            try {
                const token = await getCloudToken(projectId);
                if (!token || !isMountedRef.current) {
                    updateConnectionStatus("disconnected");
                    return;
                }

                const cloudProvider = new ThrottledWebsocketProvider(
                    `${process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL}`,
                    projectId,
                    doc,
                    {
                        params: {
                            token,
                            clientId: doc.clientID.toString(),
                        },
                    }
                );

                // Awareness updates for user list
                cloudProvider.awareness.on("update", () => {
                    if (!isMountedRef.current) return;
                    const users = Array.from(cloudProvider.awareness.getStates().values())
                        .filter((state: any) => state.user)
                        .map((state: any) => state.user);
                    setUsers(users);
                });

                // Handle connection errors by reconnecting
                cloudProvider.on("connection-error", async () => {
                    console.error("Connection error, attempting to refresh token and reconnect...");
                    if (isMountedRef.current) {
                        updateConnectionStatus("connecting");
                        cloudProvider.scheduleReconnect();
                    }
                });

                // Status updates
                cloudProvider.on("status", (e) => {
                    console.log("Connection status:", e.status);
                    if (isMountedRef.current) {
                        setTimeout(() => updateConnectionStatus(e.status), 500);
                    }
                });

                // Set provider state - this will trigger editor creation with the provider
                setProvider(cloudProvider);
            } catch (e) {
                console.error("Failed to initialize provider:", e);
                if (isMountedRef.current) {
                    updateConnectionStatus("disconnected");
                }
            }
        };

        initializeProvider();

        const handleCleanup = () => {
            if (provider && doc) {
                removeAwarenessStates(
                    (provider as ThrottledWebsocketProvider).awareness,
                    [doc.clientID],
                    "window unload"
                );
            }
        };

        window.addEventListener("beforeunload", handleCleanup);

        return () => {
            isMountedRef.current = false;
            window.removeEventListener("beforeunload", handleCleanup);
        };
    }, [doc, projectId]); // Only run when doc or project changes

    // Cleanup provider on unmount or project change
    useEffect(() => {
        return () => {
            if (provider) {
                console.log("Destroying cloud provider...");
                if (doc) {
                    removeAwarenessStates(provider.awareness, [doc.clientID], "component unmount");
                }
                provider.destroy();
            }
        };
    }, [provider, doc]);

    return { provider, users, refreshAndReconnect };
};

export const useScriptioEditor = (
    project: ProjectMembershipPayload["project"],
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void,
    userKeybinds: Record<string, string> | undefined,
    globalContext: { toggleFocusMode: () => void; saveProject: () => void }
) => {
    const projectCtx = useContext(ProjectContext);
    const { settings } = useSettings();
    const { ydoc } = useLocal(project.id);
    const { provider, refreshAndReconnect, users } = useCloud(project.id, ydoc);

    const userInfo = useRef({
        name: settings?.online?.username || "User_" + Math.floor(Math.random() * 1000),
        color: settings?.online?.color || getRandomColor(),
    });

    useEffect(() => {
        userInfo.current = {
            name: settings?.online?.username || userInfo.current.name,
            color: settings?.online?.color || userInfo.current.color,
        };
        if (provider) {
            provider.awareness.setLocalStateField("user", userInfo.current);
        }
    }, [settings?.online?.username, settings?.online?.color, provider]);

    const scriptioEditor = useEditor(
        {
            immediatelyRender: true,
            extensions: [
                ...SCRIPTIO_EXTENSIONS,
                ...(ydoc ? [Collaboration.configure({ document: ydoc })] : []),
                ...(provider
                    ? [
                          CollaborationCaret.configure({
                              provider: provider,
                              user: userInfo.current,
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

                    // The extension gives us the ID and the Editor Instance
                    onAction: (id, editorInstance) => {
                        executeAction(id, {
                            editor: editorInstance,
                            toggleFocusMode: globalContext.toggleFocusMode,
                            saveProject: globalContext.saveProject,
                        });
                    },
                }),
            ],

            // Update on each screenplay update
            onUpdate({ editor }) {
                const screenplay = editor.getJSON();
                projectCtx.updateScreenplay(screenplay);
                deferredSceneUpdate(screenplay, projectCtx);
                deferredCharactersUpdate(screenplay, projectCtx);
            },

            onCreate({ editor }) {
                projectCtx.updateEditor(editor as Editor);
            },

            // Update active on caret update
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
        },
        [ydoc, provider]
    );

    return scriptioEditor;
};
