import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";

const pluginKey = new PluginKey("orphanPrevention");

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        orphanPrevention: {
            forceOrphanUpdate: () => ReturnType;
        };
    }
}

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

export interface OrphanPreventionOptions {
    getContdLabel: () => string;
    getMoreLabel: () => string;
}

export interface OrphanPreventionExtensionOptions {
    getContdLabel: () => string;
    getMoreLabel: () => string;
}

async function computeAndDispatch(view: EditorView, isCancelled: () => boolean, options: OrphanPreventionOptions): Promise<void> {
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
                
                const isStraddling = (lastNodeTop + lastNodeHeight) > (breakerTop + 6);
                
                // Clear labels for this specific gap synchronously to avoid flashing across yields
                gapEl.querySelectorAll(".injected-dialogue-label").forEach(el => el.remove());
                
                // Debug visually: Highlight the strictly identified `lastNode` right before the page gap.
                decorations.push(
                    Decoration.node(start, start + resolved.parent.nodeSize, {
                        style: "background-color: rgba(255, 0, 0, 0.2) !important; outline: 2px solid red;",
                        class: "orphan-debug-last-node"
                    })
                );

                // If it's dialogue straddling a page break (actually physically crossing the breaker gap)
                if (isStraddling && lastNode.classList.contains("dialogue")) {
                    const nodeRect = lastNode.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(lastNode);
                    
                    const moreElem = document.createElement("div");
                    moreElem.className = "injected-dialogue-label";
                    moreElem.innerText = options.getMoreLabel();
                    moreElem.style.position = "absolute";
                    moreElem.style.top = "0px";
                    moreElem.style.left = "0px";
                    moreElem.style.width = "100%";
                    moreElem.style.textAlign = "center";
                    moreElem.style.pointerEvents = "none";
                    moreElem.style.zIndex = "10";
                    
                    moreElem.style.fontFamily = computedStyle.fontFamily;
                    moreElem.style.fontSize = computedStyle.fontSize;
                    moreElem.style.color = computedStyle.color;
                    moreElem.style.lineHeight = computedStyle.lineHeight;

                    // Find the preceding character name
                    let characterName = "";
                    for (let j = lastNodeIdx - 1; j >= 0; j--) {
                        if (paragraphs[j].classList.contains("character")) {
                            characterName = paragraphs[j].innerText.trim();
                            break;
                        }
                    }

                    const contElem = document.createElement("div");
                    contElem.className = "injected-dialogue-label";
                    contElem.innerText = characterName ? `${characterName} ${options.getContdLabel()}` : options.getContdLabel();
                    contElem.style.position = "absolute";
                    contElem.style.bottom = "0px";
                    contElem.style.left = "0px";
                    contElem.style.width = "100%";
                    contElem.style.textAlign = "center";
                    contElem.style.pointerEvents = "none";
                    contElem.style.zIndex = "10";
                    contElem.style.textTransform = "uppercase";
                    
                    contElem.style.fontFamily = computedStyle.fontFamily;
                    contElem.style.fontSize = computedStyle.fontSize;
                    contElem.style.lineHeight = computedStyle.lineHeight;
                    contElem.style.color = computedStyle.color;
                    
                    gapEl.appendChild(moreElem);
                    gapEl.appendChild(contElem);
                } else if (isStraddling) {
                    decorations.push(
                        Decoration.node(start, start + resolved.parent.nodeSize, {
                            style: "background-color: red;",
                        }),
                    );
                }
            } catch {
                // detached or invalid position — skip
            }
        }

        // Yield between page gaps so queued input events can be processed first.
        await yieldToMain();
    }

    if (isCancelled() || (view as any).isDestroyed) return;
    view.dispatch(view.state.tr.setMeta(pluginKey, DecorationSet.create(view.state.doc, decorations)));
}

export const OrphanPreventionExtension = Extension.create<OrphanPreventionExtensionOptions>({
    name: "orphanPrevention",
    
    addOptions() {
        return {
            getContdLabel: () => "(CONT'D)",
            getMoreLabel: () => "(MORE)",
        };
    },

    addCommands() {
        return {
            forceOrphanUpdate:
                () =>
                ({ tr, dispatch }) => {
                    if (dispatch) {
                        tr.setMeta(pluginKey, "force-update");
                    }
                    return true;
                },
        };
    },

    addProseMirrorPlugins() {
        const options = this.options;
        return [
            new Plugin({
                key: pluginKey,
                state: {
                    init: () => ({ decos: DecorationSet.empty }),
                    apply(tr, old, _, newState) {
                        const meta = tr.getMeta(pluginKey);
                        if (meta instanceof DecorationSet) return { decos: meta };
                        
                        let nextDecos = old.decos;
                        if (tr.docChanged) {
                            nextDecos = old.decos.map(tr.mapping, newState.doc);
                        }
                        
                        if (meta === "force-update" || tr.docChanged) {
                            return { decos: nextDecos };
                        }
                        
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
                            computeAndDispatch(view, () => generation !== gen, options);
                        });
                    };

                    // Pagination builds its DOM in its own RAF (after ours). Watch for
                    // gap elements appearing so we can recompute once they exist, then
                    // disconnect — zero cost after initial mount.
                    const observer = new MutationObserver(() => {
                        if ((view.dom as HTMLElement).querySelector(".rm-pagination-gap")) {
                            observer.disconnect(); // Disconnect to prevent infinite loops from our own DOM mutations
                            schedule();
                        }
                    });
                    observer.observe(view.dom as HTMLElement, {
                        childList: true,
                        subtree: true,
                    });

                    // Ensure the editor has relative positioning so our absolute widgets flow inside it
                    if (window.getComputedStyle(view.dom).position === "static") {
                        (view.dom as HTMLElement).style.position = "relative";
                    }

                    schedule();
                    return {
                        update(view, prev) {
                            if (
                                view.state.doc !== prev.doc ||
                                pluginKey.getState(view.state) !== pluginKey.getState(prev)
                            ) {
                                schedule();
                            }
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
                        const pluginState = this.getState(state);
                        return pluginState ? pluginState.decos : DecorationSet.empty;
                    },
                },
            }),
        ];
    },
});
