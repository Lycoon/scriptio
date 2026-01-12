import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { computeContdIndices } from "./contd";
import { Screenplay } from "../utils/types";

const contdPluginKey = new PluginKey("contd");

/**
 * Computes decorations for character nodes that should display "(CONT'D)".
 * Uses the shared computeContdIndices utility for the logic.
 */
function computeContdDecorations(doc: any): DecorationSet {
    const screenplay = doc.toJSON() as Screenplay;
    const contdIndices = computeContdIndices(screenplay);

    if (contdIndices.size === 0) {
        return DecorationSet.empty;
    }

    const decorations: Decoration[] = [];
    let nodeIndex = 0;

    doc.forEach((node: any, pos: number) => {
        if (contdIndices.has(nodeIndex)) {
            decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                    class: "contd",
                })
            );
        }
        nodeIndex++;
    });

    return DecorationSet.create(doc, decorations);
}

export const ContdExtension = Extension.create({
    name: "contd",

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: contdPluginKey,
                state: {
                    init(_, { doc }) {
                        return computeContdDecorations(doc);
                    },
                    apply(tr, oldDecorations) {
                        if (tr.docChanged) {
                            return computeContdDecorations(tr.doc);
                        }
                        return oldDecorations;
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
