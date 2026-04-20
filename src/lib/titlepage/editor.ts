import { Editor, Extension, getSchema } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { TitlePageElement, Style } from "../utils/enums";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";

import { TitlePageExtensions } from "./nodes";
import { ScriptioBold, ScriptioItalic, ScriptioUnderline } from "../screenplay/nodes";
import { Placeholder } from "../screenplay/extensions/placeholder-extension";

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
        const node = (sel as NodeSelection).node;
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

type JSONMark = { type: string; attrs?: Record<string, unknown> };
type JSONInlineNode = { type: string; text?: string; marks?: JSONMark[] };

const LINE = (align: string = "left", content?: JSONInlineNode[]) => ({
    type: "tp-text",
    attrs: { textAlign: align },
    content,
});

const TEXT = (text: string) => ({ type: "text", text });
const FORMAT_NODE = (type: TitlePageElement, marks?: JSONMark[]) => (marks ? { type, marks } : { type });
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
    EMPTY(),
    LINE("center", [TEXT("by")]),
    EMPTY(),
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
