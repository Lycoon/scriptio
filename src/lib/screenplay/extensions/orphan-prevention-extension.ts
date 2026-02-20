import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";

const pluginKey = new PluginKey("orphanPrevention");

function yieldToMain(): Promise<void> {
    return new Promise<void>((resolve) => {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = () => resolve();
        port2.postMessage(null);
    });
}

async function computeAndDispatch(view: EditorView, isCancelled: () => boolean): Promise<void> {
    const editorDom = view.dom as HTMLElement;
    const editorTop = editorDom.getBoundingClientRect().top;

    const gapEls = Array.from(editorDom.querySelectorAll(".breaker"));

    if (gapEls.length === 0) {
        if (!isCancelled()) view.dispatch(view.state.tr.setMeta(pluginKey, DecorationSet.empty));
        return;
    }

    const paragraphs = Array.from(editorDom.children).filter((el) => el.tagName === "P") as HTMLElement[];

    const decorations: Decoration[] = [];

    for (const gapEl of gapEls) {
        if (isCancelled()) return;

        const gapTop = gapEl.getBoundingClientRect().top - editorTop;
        let lastNode: HTMLElement | null = null;
        let lastNodeIdx = -1;
        let breakerTop = 0;
        let lastNodeTop = 0;
        for (let i = 0; i < paragraphs.length; i++) {
            const pTop = paragraphs[i].getBoundingClientRect().top - editorTop;
            //console.log(`Paragraph ${i} top: ${pTop}px (gap at ${gapTop}px)`);
            if (pTop < gapTop) {
                lastNode = paragraphs[i];
                lastNodeIdx = i;
                breakerTop = gapTop;
                lastNodeTop = pTop;
            } else break;
        }

        if (lastNode) {
            // Red: node that straddles the page break (debug reference).
            try {
                const pos = view.posAtDOM(lastNode, 0);
                const resolved = view.state.doc.resolve(pos);
                const start = resolved.before(resolved.depth);
                decorations.push(
                    Decoration.node(start, start + resolved.parent.nodeSize, {
                        style: "background-color: red;",
                    }),
                );
            } catch {
                // detached or invalid position — skip
            }

            // Green: orphan — a character or scene heading immediately above the
            // straddling node, meaning it would be left alone at the bottom of the page.
            if (lastNodeIdx > 0) {
                const prevNode = paragraphs[lastNodeIdx - 1];
                const isOrphanCandidate =
                    prevNode.classList.contains("character") || prevNode.classList.contains("scene");

                if (isOrphanCandidate) {
                    const prevBottom = prevNode.getBoundingClientRect().bottom - editorTop;
                    // "close enough" = prevNode is immediately above lastNode (≤ 4 line-heights apart).
                    console.log(
                        `Orphan candidate at ${lastNodeTop}px, breaker top at ${breakerTop}px: ${breakerTop - lastNodeTop}px gap (threshold: ${2 * 17}px)`,
                    );
                    if (breakerTop - lastNodeTop <= 2 * 17) {
                        try {
                            const pos = view.posAtDOM(prevNode, 0);
                            const resolved = view.state.doc.resolve(pos);
                            const start = resolved.before(resolved.depth);
                            decorations.push(
                                Decoration.node(start, start + resolved.parent.nodeSize, {
                                    style: "background-color: green;",
                                }),
                            );
                        } catch {
                            // detached or invalid position — skip
                        }
                    }
                }
            }
        }

        // Yield between page gaps so queued input events can be processed first.
        await yieldToMain();
    }

    if (isCancelled() || (view as any).isDestroyed) return;
    view.dispatch(view.state.tr.setMeta(pluginKey, DecorationSet.create(view.state.doc, decorations)));
}

export const OrphanPreventionExtension = Extension.create({
    name: "orphanPrevention",

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: pluginKey,
                state: {
                    init: () => DecorationSet.empty,
                    apply(tr, old, _, newState) {
                        const meta = tr.getMeta(pluginKey);
                        if (meta instanceof DecorationSet) return meta;
                        if (tr.docChanged) return old.map(tr.mapping, newState.doc);
                        return old;
                    },
                },
                view(view) {
                    let raf: number | null = null;
                    let generation = 0;

                    const schedule = () => {
                        if (raf !== null) cancelAnimationFrame(raf);
                        const gen = ++generation;
                        raf = requestAnimationFrame(() => {
                            raf = null;
                            computeAndDispatch(view, () => generation !== gen);
                        });
                    };

                    // Pagination builds its DOM in its own RAF (after ours). Watch for
                    // gap elements appearing so we can recompute once they exist, then
                    // disconnect — zero cost after initial mount.
                    const observer = new MutationObserver(() => {
                        if ((view.dom as HTMLElement).querySelector(".rm-pagination-gap")) {
                            schedule();
                        }
                    });
                    observer.observe(view.dom as HTMLElement, {
                        childList: true,
                        subtree: true,
                    });

                    schedule();
                    return {
                        update(view, prev) {
                            if (view.state.doc !== prev.doc) schedule();
                        },
                        destroy() {
                            generation++;
                            observer.disconnect();
                            if (raf !== null) cancelAnimationFrame(raf);
                        },
                    };
                },
                props: {
                    decorations(state) {
                        return this.getState(state) as DecorationSet;
                    },
                },
            }),
        ];
    },
});
