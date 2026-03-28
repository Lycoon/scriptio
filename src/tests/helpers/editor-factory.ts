import { Editor } from "@tiptap/core";
import type { Extensions, JSONContent } from "@tiptap/core";

export function createTestEditor(extensions: Extensions, content: JSONContent[]) {
    const el = document.createElement("div");
    // Attached to real DOM so getBoundingClientRect() returns real layout values
    document.body.appendChild(el);

    const editor = new Editor({
        element: el,
        extensions,
        content: { type: "doc", content },
        autofocus: false,
        injectCSS: false,
    });

    /** Collect positions of the first text offset inside nodes of a given type. */
    const positionsOfType = (type: string): number[] => {
        const positions: number[] = [];
        editor.state.doc.forEach((node, pos) => {
            if (node.type.name === type) positions.push(pos + 1);
        });
        return positions;
    };

    /**
     * Returns [beginning, middle, end] positions inside nodes of the given type.
     * Falls back to pos 1 if the type isn't found.
     */
    const threePositions = (type: string): [number, number, number] => {
        const all = positionsOfType(type);
        if (all.length === 0) return [1, 1, 1];
        return [
            all[0],
            all[Math.floor(all.length / 2)],
            all[all.length - 1],
        ];
    };

    return {
        editor,
        threePositions,
        cleanup: () => {
            editor.destroy();
            el.remove();
        },
    };
}
