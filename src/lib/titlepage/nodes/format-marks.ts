import { Node } from "@tiptap/core";
import { Mark, Node as PMNode } from "@tiptap/pm/model";
import { TitlePageElement } from "../../utils/enums";
import { titlePageMetadataRef } from "../metadata-ref";

/**
 * Title page format nodes.
 *
 * These are indivisible inline atom nodes that represent dynamic
 * placeholders (Title, Author, Date). They render as <span> with
 * a CSS class and are mutually exclusive per line.
 *
 * Being atom nodes means:
 * - The cursor cannot be placed inside them
 * - They are selected/deleted as a single unit
 * - Their displayed text is the expanded value from project metadata
 */

const PLACEHOLDERS: Record<string, string> = {
    [TitlePageElement.Title]: "{{ Title }}",
    [TitlePageElement.Author]: "{{ Author }}",
    [TitlePageElement.Date]: "{{ Date }}",
};

function resolveValue(
    name: TitlePageElement,
    storage: { projectTitle?: string; projectAuthor?: string },
): string {
    if (name === TitlePageElement.Title) return storage?.projectTitle || "";
    if (name === TitlePageElement.Author) return storage?.projectAuthor || "";
    if (name === TitlePageElement.Date) {
        return new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }
    return "";
}

// Helper to create a title-page format atom node
function createFormatNode(name: TitlePageElement) {
    const placeholder = PLACEHOLDERS[name];

    return Node.create({
        name,

        group: "inline",
        inline: true,
        atom: true,
        marks: "_",
        selectable: true,
        draggable: false,

        parseHTML() {
            return [
                {
                    tag: "span",
                    getAttrs: (el: HTMLElement) => {
                        return el.getAttribute("data-tp-type") === name ? {} : false;
                    },
                },
                // Backward compat: parse old mark-based spans
                {
                    tag: "span",
                    getAttrs: (el: HTMLElement) => {
                        return el.getAttribute("class") === name ? {} : false;
                    },
                },
            ];
        },

        renderHTML() {
            return [
                "span",
                { class: name, "data-tp-type": name },
                placeholder,
            ];
        },

        addNodeView() {
            return ({ node, editor }) => {
                const dom = document.createElement("span");
                dom.contentEditable = "false";
                dom.setAttribute("data-tp-type", name);

                // Apply base classes plus any mark-driven classes (e.g. underline)
                const applyMarkClasses = (marks: readonly Mark[]) => {
                    const markClasses = marks
                        .map((m: Mark) => m.attrs?.class || m.type.name)
                        .filter(Boolean);
                    // Preserve tp-format-placeholder before rebuilding className
                    const isPlaceholder = dom.classList.contains("tp-format-placeholder");
                    dom.className = [`${name} tp-format-node`, ...markClasses].join(" ");
                    if (isPlaceholder) dom.classList.add("tp-format-placeholder");
                };

                applyMarkClasses(node.marks);

                const refresh = () => {
                    // Read from the module-level ref which is updated
                    // synchronously during every React render, bypassing
                    // any TipTap storage timing issues.
                    const value = resolveValue(name, titlePageMetadataRef);
                    dom.textContent = value || placeholder;
                    dom.classList.toggle("tp-format-placeholder", !value);
                };

                refresh();

                // Register for metadata-driven updates
                const updaters: Set<() => void> | undefined = (
                    editor.storage as unknown as Record<string, { nodeViewUpdaters?: Set<() => void> }>
                ).titlePageMetadata?.nodeViewUpdaters;
                updaters?.add(refresh);

                return {
                    dom,
                    // Called by ProseMirror when this node's attrs or marks change
                    update(updatedNode: PMNode) {
                        applyMarkClasses(updatedNode.marks);
                        return true;
                    },
                    destroy() {
                        updaters?.delete(refresh);
                    },
                };
            };
        },
    });
}

export const TitleNode = createFormatNode(TitlePageElement.Title);
export const AuthorNode = createFormatNode(TitlePageElement.Author);
export const DateNode = createFormatNode(TitlePageElement.Date);

export const TitlePageFormatNodes = [TitleNode, AuthorNode, DateNode];
