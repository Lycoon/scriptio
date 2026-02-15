import { Node } from "@tiptap/core";
import { TitlePageElement } from "../../utils/enums";

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
        selectable: true,
        draggable: false,

        parseHTML() {
            return [
                {
                    tag: "span",
                    getAttrs: (el: any) => {
                        return el.getAttribute("data-tp-type") === name ? {} : false;
                    },
                },
                // Backward compat: parse old mark-based spans
                {
                    tag: "span",
                    getAttrs: (el: any) => {
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
            return ({ editor }) => {
                const dom = document.createElement("span");
                dom.className = `${name} tp-format-node`;
                dom.contentEditable = "false";
                dom.setAttribute("data-tp-type", name);

                const refresh = () => {
                    const s = (editor.storage as any).titlePageMetadata;
                    const value = resolveValue(name, s);
                    dom.textContent = value || placeholder;
                    dom.classList.toggle("tp-format-placeholder", !value);
                };

                refresh();

                // Register for metadata-driven updates
                const updaters: Set<() => void> | undefined = (editor.storage as any)
                    .titlePageMetadata?.nodeViewUpdaters;
                updaters?.add(refresh);

                return {
                    dom,
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
