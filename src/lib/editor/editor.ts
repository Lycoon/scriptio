import { Editor, JSONContent, useEditor } from "@tiptap/react";
import { SaveStatus, ScreenplayElement, Style } from "../utils/enums";
import { saveScreenplay } from "../utils/requests";
import { ProjectContext, ProjectContextType } from "@src/context/ProjectContext";

import { CustomBold, CustomItalic, CustomUnderline, Screenplay } from "@src/Screenplay";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { computeFullScenesData } from "./screenplay";
import { computeFullCharactersData } from "./characters";
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import debounce from "debounce";
import { SuggestionData } from "@components/editor/SuggestionMenu";
import * as Y from "yjs";
import { Project } from "../utils/types";
import { IndexeddbPersistence } from "y-indexeddb";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { WebsocketProvider } from "y-websocket";
import { Awareness, removeAwarenessStates } from "@node_modules/y-protocols/awareness";
import { useSettings } from "../utils/hooks";
import { getRandomColor } from "../utils/misc";

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
    editor.commands.setContent(screenplay);
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

export const SCRIPTIO_EXTENSIONS = [
    Document.configure({
        content: "Screenplay+",
    }),
    Text,
    Screenplay,
    CustomBold,
    CustomItalic,
    CustomUnderline,
];

const SCREENPLAY_SAVE_DELAY = 2000;
const SCENE_UPDATE_DELAY = 500;
const CHARACTERS_UPDATE_DELAY = 500;

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

const useLocal = (projectId: string) => {
    const [ydoc, setYdoc] = useState<Y.Doc | null>(null);

    useEffect(() => {
        if (!projectId) return;

        console.log("Loading local YDoc for project:", projectId);
        const doc = new Y.Doc();
        const localProvider = new IndexeddbPersistence(projectId, doc);
        setYdoc(doc);

        return () => {
            localProvider.destroy();
            doc.destroy();
        };
    }, [projectId]);

    return { ydoc };
};

const useCloud = (projectId: string, doc: Y.Doc | null) => {
    const [provider, setProvider] = useState<WebsocketProvider | null>(null);
    const [status, setStatus] = useState<string>("connecting");
    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        if (!doc || !projectId) {
            if (provider) provider.destroy();
            setProvider(null);
            setStatus("disabled");
            return;
        }

        const connect = async () => {
            const token = await fetch(`/api/projects/${projectId}/collab-token`);
            if (!token.ok) {
                setStatus("unauthorized");
                return;
            }

            const { data } = await token.json();
            const cloudProvider = new WebsocketProvider(
                `${process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL}`,
                projectId,
                doc,
                {
                    params: {
                        token: data.token,
                        clientId: doc.clientID.toString(),
                    },
                }
            );
            setProvider(cloudProvider);

            const disconnect = () => {
                removeAwarenessStates(cloudProvider.awareness, [doc.clientID], "window unload");
                cloudProvider.destroy();
            };

            // If a user disconnects, we remove its awareness state
            window.addEventListener("beforeunload", disconnect);
            cloudProvider.on("status", (event: any) => {
                setStatus(event.status);
            });

            // Listen to connected users
            cloudProvider.awareness.on("update", () => {
                const users = Array.from(cloudProvider.awareness.getStates().values())
                    .filter((state: any) => state.user)
                    .map((state: any) => state.user);
                setUsers(users);
            });

            return () => {
                disconnect();
            };
        };

        connect();
    }, [doc, projectId]);

    return { provider, status, users };
};

export const useScriptioEditor = (
    project: Project,
    setActiveElement: (element: ScreenplayElement, applyStyle: boolean) => void,
    setSelectedStyles: (style: Style) => void,
    updateSuggestions: (suggestions: string[]) => void,
    updateSuggestionsData: (data: SuggestionData) => void
) => {
    const projectCtx = useContext(ProjectContext);
    const { onlineUsername, onlineColor } = useSettings();
    const { ydoc } = useLocal(project.id);
    const { provider, status, users } = useCloud(project.id, ydoc);

    const scriptioEditor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                ...SCRIPTIO_EXTENSIONS,
                ...(ydoc && provider
                    ? [
                          Collaboration.configure({
                              document: ydoc,
                          }),
                          CollaborationCaret.configure({
                              provider: provider,
                              user: {
                                  name: onlineUsername || "User_" + Math.floor(Math.random() * 1000),
                                  color: onlineColor || getRandomColor(),
                              },
                              render: (user: any) => {
                                  const caret = document.createElement("span");
                                  caret.classList.add("collab-caret");
                                  caret.style.borderLeft = `2px solid ${user.color}`;
                                  caret.style.marginLeft = "-1px";
                                  caret.style.height = "1em";
                                  caret.style.position = "absolute";
                                  caret.style.zIndex = "10";
                                  const label = document.createElement("div");
                                  label.classList.add("collab-caret-label");
                                  label.style.backgroundColor = user.color;
                                  label.style.color = "white";
                                  label.style.padding = "2px 4px";
                                  label.style.position = "absolute";
                                  label.style.top = "-1.5em";
                                  label.style.fontSize = "0.75em";
                                  label.style.whiteSpace = "nowrap";
                                  label.innerText = user.name;
                                  caret.appendChild(label);
                                  return caret;
                              },
                          }),
                      ]
                    : []),
            ],

            // Update on each screenplay update
            onUpdate({ editor }) {
                console.log("onUpdate");
                const screenplay = editor.getJSON();
                projectCtx.updateSaveStatus(SaveStatus.Saving);
                deferredSceneUpdate(screenplay, projectCtx);
                deferredCharactersUpdate(screenplay, projectCtx);
            },

            onCreate({ editor }) {
                console.log("onCreate");
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
