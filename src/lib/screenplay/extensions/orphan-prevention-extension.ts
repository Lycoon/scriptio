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

async function isOrphanable(node: HTMLElement): Promise<boolean> {
    return node.classList.contains("character") || node.classList.contains("scene");
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

    let lastNodeIdx = 0;
    for (const gapEl of gapEls) {
        if (isCancelled()) return;

        const breakerRect = gapEl.getBoundingClientRect();
        let breakerTop = breakerRect.top - editorTop;
        let lastNode: HTMLElement | null = null;
        let lastNodeTop = 0;
        let lastNodeHeight = 0;

        for (let i = lastNodeIdx + 1; i < paragraphs.length; i++) {
            const pRect = paragraphs[i].getBoundingClientRect();
            const pTop = pRect.top - editorTop;
            // We put -6px because when a node starts on next page it sometimes flow up to previous one
            // and outranges the breaker top by few pixels, gets detected as last node while it's not.
            if (pTop < breakerTop - 6) {
                lastNode = paragraphs[i];
                lastNodeIdx = i;
                lastNodeTop = pTop;
                lastNodeHeight = pRect.height;
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
                const isLastOrphanable = await isOrphanable(lastNode);
                const isPrevOrphanable = await isOrphanable(prevNode);

                if (isPrevOrphanable) {
                    const prevRect = prevNode.getBoundingClientRect();
                    const prevBottom = prevRect.bottom - editorTop;
                    console.log(
                        `Orphan candidate at ${prevBottom}px, breaker top at ${breakerTop}px: ${breakerTop - lastNodeTop}px gap (threshold: ${2 * 17}px)`,
                    );
                    if (breakerTop - prevBottom <= 2 * 17 + 6) {
                        try {
                            const height = prevRect.height;
                            const pos = view.posAtDOM(prevNode, 0);
                            const resolved = view.state.doc.resolve(pos);
                            const start = resolved.before(resolved.depth);
                            decorations.push(
                                Decoration.node(start, start + resolved.parent.nodeSize, {
                                    style: `background-color: green;`,
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
