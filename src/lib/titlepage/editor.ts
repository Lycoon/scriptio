"use client";

import { Editor, Extension, getSchema, useEditor } from "@tiptap/react";
import { TitlePageElement, Style } from "../utils/enums";
import { ProjectContext } from "@src/context/ProjectContext";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useContext, useEffect, useRef } from "react";
import { useUser } from "../utils/hooks";
import { getRandomColor } from "../utils/misc";

import { TitlePageExtensions } from "./nodes";
import { ScriptioBold, ScriptioItalic, ScriptioUnderline } from "../screenplay/nodes";
import { Placeholder } from "../screenplay/extensions/placeholder-extension";
import { getStylesFromMarks, SCREENPLAY_FORMATS } from "../screenplay/editor";
import { ScriptioPagination } from "../screenplay/extensions/pagination-extension";

import { titlePageMetadataRef } from "./metadata-ref";

const TitlePageMetadata = Extension.create({
    name: "titlePageMetadata",
    addStorage() {
        return {
            projectTitle: "",
            projectAuthor: "",
            nodeViewUpdaters: new Set<() => void>(),
        };
    },
});

/**
 * Insert a title page format node at the current cursor position.
 * If the cursor is already on/adjacent to a format node of the same type, remove it.
 * Format nodes are mutually exclusive — only one type per insertion point.
 */
export const applyTitlePageElement = (editor: Editor, element: TitlePageElement) => {
    if (element === TitlePageElement.None) {
        // Remove format node at cursor if any
        const { $anchor } = editor.state.selection;
        const nodeAfter = $anchor.nodeAfter;
        const nodeBefore = $anchor.nodeBefore;

        if (nodeAfter && isFormatNode(nodeAfter.type.name)) {
            editor
                .chain()
                .focus()
                .deleteRange({
                    from: $anchor.pos,
                    to: $anchor.pos + nodeAfter.nodeSize,
                })
                .run();
        } else if (nodeBefore && isFormatNode(nodeBefore.type.name)) {
            editor
                .chain()
                .focus()
                .deleteRange({
                    from: $anchor.pos - nodeBefore.nodeSize,
                    to: $anchor.pos,
                })
                .run();
        }
        return;
    }

    // Check if cursor is adjacent to a format node of the same type
    const { $anchor } = editor.state.selection;
    const nodeAfter = $anchor.nodeAfter;
    const nodeBefore = $anchor.nodeBefore;

    if (nodeAfter?.type.name === element) {
        // Toggle off: delete the node
        editor
            .chain()
            .focus()
            .deleteRange({
                from: $anchor.pos,
                to: $anchor.pos + nodeAfter.nodeSize,
            })
            .run();
        return;
    }

    if (nodeBefore?.type.name === element) {
        // Toggle off: delete the node
        editor
            .chain()
            .focus()
            .deleteRange({
                from: $anchor.pos - nodeBefore.nodeSize,
                to: $anchor.pos,
            })
            .run();
        return;
    }

    // Insert the format node, replacing any selected content
    editor.chain().focus().insertContent({ type: element }).run();
};

function isFormatNode(name: string): boolean {
    return name === TitlePageElement.Title || name === TitlePageElement.Author || name === TitlePageElement.Date;
}

export const applyTitlePageMarkToggle = (editor: Editor, style: Style) => {
    if (style & Style.Bold) editor.chain().toggleBold().focus().run();
    if (style & Style.Italic) editor.chain().toggleItalic().focus().run();
    if (style & Style.Underline) editor.chain().toggleUnderline().focus().run();
};

/**
 * Detect which title page format node is at the cursor.
 */
export const getActiveTitlePageElement = (editor: Editor): TitlePageElement => {
    const { $anchor } = editor.state.selection;
    const nodeAfter = $anchor.nodeAfter;
    const nodeBefore = $anchor.nodeBefore;

    if (nodeAfter?.type.name === TitlePageElement.Title || nodeBefore?.type.name === TitlePageElement.Title)
        return TitlePageElement.Title;
    if (nodeAfter?.type.name === TitlePageElement.Author || nodeBefore?.type.name === TitlePageElement.Author)
        return TitlePageElement.Author;
    if (nodeAfter?.type.name === TitlePageElement.Date || nodeBefore?.type.name === TitlePageElement.Date)
        return TitlePageElement.Date;

    // Also check if the selection itself is a node selection
    const sel = editor.state.selection;
    if ("node" in sel) {
        const node = (sel as any).node;
        if (node && isFormatNode(node.type.name)) {
            return node.type.name as TitlePageElement;
        }
    }

    return TitlePageElement.None;
};

export const TITLEPAGE_BASE_EXTENSIONS = [
    Text,

    TitlePageMetadata,

    ...TitlePageExtensions,

    // Reuse mark extensions from screenplay
    ScriptioBold,
    ScriptioItalic,
    ScriptioUnderline,

    Placeholder.configure({
        placeholder: "",
    }),

    Document.configure({
        content: "tp-text*",
    }),
];

export const TitlePageSchema = getSchema(TITLEPAGE_BASE_EXTENSIONS);

const LINE = (align: string = "left", content?: any[]) => ({
    type: "tp-text",
    attrs: { textAlign: align },
    content,
});

const TEXT = (text: string) => ({ type: "text", text });
const FORMAT_NODE = (type: TitlePageElement, marks?: any[]) => (marks ? { type, marks } : { type });
const EMPTY = (align: string = "left") => LINE(align);

export const DEFAULT_TITLEPAGE_CONTENT = [
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    LINE("center", [FORMAT_NODE(TitlePageElement.Title, [{ type: "underline", attrs: { class: "underline" } }])]),
    LINE("center", [TEXT("by")]),
    LINE("center", [FORMAT_NODE(TitlePageElement.Author)]),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    LINE("left", [FORMAT_NODE(TitlePageElement.Date)]),
];

export const useTitlePageEditor = () => {
    const projectCtx = useContext(ProjectContext);
    const { user } = useUser();
    const {
        repository,
        provider,
        isYjsReady,
        setSelectedTitlePageElement,
        setSelectedStyles,
        pageFormat: pageSize,
        projectTitle,
        projectAuthor,
    } = projectCtx;

    const projectState = repository?.getState();

    // Keep the module-level ref in sync on every render so that format
    // node views always resolve the latest values, even when created
    // asynchronously by the Collaboration extension.
    titlePageMetadataRef.projectTitle = projectTitle || "";
    titlePageMetadataRef.projectAuthor = projectAuthor || "";

    const userInfoRef = useRef({
        name: user?.username || "User_" + Math.floor(Math.random() * 1000),
        color: user?.color || getRandomColor(),
    });

    useEffect(() => {
        userInfoRef.current = {
            name: user?.username || userInfoRef.current.name,
            color: user?.color || userInfoRef.current.color,
        };
    }, [user?.username, user?.color]);

    const titlePageEditor = useEditor(
        {
            immediatelyRender: false,
            editorProps: {
                handleScrollToSelection: () => true,
            },
            extensions: [
                ...TITLEPAGE_BASE_EXTENSIONS,
                ...(projectState && isYjsReady
                    ? [
                          Collaboration.configure({
                              document: projectState,
                              fragment: projectState.titlepageFragment(),
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
                ScriptioPagination.configure({
                    pageGap: 20,
                    headerLeft: "",
                    headerRight: "",
                    footerLeft: "",
                    footerRight: "",
                    customHeader: {},
                    customFooter: {},
                    ...SCREENPLAY_FORMATS[pageSize],
                }),
            ],

            onSelectionUpdate({ editor }) {
                const activeElement = getActiveTitlePageElement(editor);
                setSelectedTitlePageElement(activeElement);

                const anchor = editor.state.selection.$anchor;
                if (anchor.nodeBefore) {
                    setSelectedStyles(getStylesFromMarks(anchor.nodeBefore.marks as any[]));
                } else {
                    setSelectedStyles(Style.None);
                }
            },
        },
        [projectState, provider, isYjsReady],
    );

    // Update storage synchronously during render. This ensures that when TipTap
    // delays nodeView mount due to immediatelyRender: false, the data is already available.
    if (titlePageEditor && typeof titlePageEditor.storage === "object") {
        const storage = (titlePageEditor.storage as any).titlePageMetadata;
        if (storage) {
            storage.projectTitle = projectTitle || "";
            storage.projectAuthor = projectAuthor || "";
        }
    }

    // Register editor in ProjectContext
    useEffect(() => {
        if (titlePageEditor) {
            projectCtx.updateTitlePageEditor(titlePageEditor);
        }
        return () => {
            projectCtx.updateTitlePageEditor(null);
        };
    }, [titlePageEditor]);

    // Initialize default template if title page is empty
    useEffect(() => {
        if (!titlePageEditor || !isYjsReady || !repository || !titlePageEditor.view) return;

        const state = repository.getState();
        const meta = state.metadata();

        if (!meta.get("titlepageInitialized")) {
            // Apply content first, then set the flag — if setContent throws, the flag
            // stays unset so the next render will retry rather than leaving a blank page.
            titlePageEditor.commands.setContent(DEFAULT_TITLEPAGE_CONTENT);

            // Apply underline to the title format node as a separate transaction —
            // the same operation the navbar button performs. Marks on inline atom nodes
            // are not preserved by the Collaboration extension's Yjs conversion when
            // embedded in the setContent JSON, so we apply them explicitly here.
            const { state, view } = titlePageEditor;
            const tr = state.tr;
            let modified = false;

            tr.doc.descendants((node, pos) => {
                if (node.type.name === TitlePageElement.Title) {
                    const markType = state.schema.marks.underline;
                    if (markType) {
                        tr.addMark(pos, pos + node.nodeSize, markType.create({ class: "underline" }));
                        modified = true;
                    }
                    return false;
                }
            });

            if (modified && view) {
                view.dispatch(tr);
            }

            meta.set("titlepageInitialized", true);
        }
    }, [titlePageEditor, isYjsReady, repository]);

    // Sync project metadata into editor storage for node view rendering
    useEffect(() => {
        if (!titlePageEditor || titlePageEditor.isDestroyed) return;
        const storage = (titlePageEditor.storage as any).titlePageMetadata;
        if (storage) {
            storage.projectTitle = projectTitle || "";
            storage.projectAuthor = projectAuthor || "";
            // Refresh all format node views with updated values
            storage.nodeViewUpdaters?.forEach((fn: () => void) => fn());
            if (titlePageEditor.view && !titlePageEditor.view.isDestroyed) {
                titlePageEditor.view.dispatch(titlePageEditor.state.tr.setMeta("titlePageMetadataUpdate", true));
            }
        }
    }, [titlePageEditor, projectTitle, projectAuthor]);

    // Sync page size when format changes
    useEffect(() => {
        if (!titlePageEditor || titlePageEditor.isDestroyed) return;
        try {
            titlePageEditor.chain().updatePageSize(SCREENPLAY_FORMATS[pageSize]).run();
        } catch {
            // Editor view not mounted yet
        }
    }, [titlePageEditor, pageSize]);

    return titlePageEditor;
};
