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
import { PaginationPlus } from "tiptap-pagination-plus";

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
    return (
        name === TitlePageElement.Title ||
        name === TitlePageElement.Author ||
        name === TitlePageElement.Date
    );
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

    if (
        nodeAfter?.type.name === TitlePageElement.Title ||
        nodeBefore?.type.name === TitlePageElement.Title
    )
        return TitlePageElement.Title;
    if (
        nodeAfter?.type.name === TitlePageElement.Author ||
        nodeBefore?.type.name === TitlePageElement.Author
    )
        return TitlePageElement.Author;
    if (
        nodeAfter?.type.name === TitlePageElement.Date ||
        nodeBefore?.type.name === TitlePageElement.Date
    )
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

// Helper for default content
const LINE = (align: string = "left", content?: any[]) => ({
    type: "tp-text",
    attrs: { textAlign: align },
    content,
});

const TEXT = (text: string) => ({ type: "text", text });

const FORMAT_NODE = (type: TitlePageElement) => ({ type });

const EMPTY = (align: string = "left") => LINE(align);

export const DEFAULT_TITLEPAGE_CONTENT = [
    // Push title to roughly 1/3 down the page
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
    EMPTY(),
    EMPTY(),
    EMPTY(),
    EMPTY(),
    LINE("center", [FORMAT_NODE(TitlePageElement.Title)]),
    EMPTY("center"),
    LINE("center", [TEXT("by")]),
    EMPTY("center"),
    LINE("center", [FORMAT_NODE(TitlePageElement.Author)]),
    // Push date to bottom
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
                PaginationPlus.configure({
                    pageGap: 20,
                    contentMarginTop: 96, // Full 1in top margin — no header on title page
                    headerRight: "",
                    footerRight: "",
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
        if (!titlePageEditor || !isYjsReady || !repository) return;

        const state = repository.getState();
        const meta = state.metadata();

        if (!meta.get("titlepageInitialized")) {
            state.transact(() => {
                if (!meta.get("titlepageInitialized")) {
                    meta.set("titlepageInitialized", true);
                    titlePageEditor.commands.setContent(DEFAULT_TITLEPAGE_CONTENT);
                }
            });
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
            titlePageEditor.view.dispatch(
                titlePageEditor.state.tr.setMeta("titlePageMetadataUpdate", true),
            );
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
