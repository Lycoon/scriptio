import type { JSONContent } from "@tiptap/core";
import { BASE_EXTENSIONS, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScriptioPagination } from "@src/lib/screenplay/extensions/pagination-extension";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { createSpellcheckExtension } from "@src/lib/spellcheck/spellcheck-extension";
import { createTestEditor } from "../helpers/editor-factory";
import { pluginBenchSuite } from "../helpers/bench-suite";

/**
 * Synchronous mock Worker: responds immediately via queueMicrotask so the
 * spellcheck extension can process results without loading hunspell WASM.
 * Reports all words as correctly spelled (misspelled: []).
 */
class SyncWorker extends EventTarget {
    postMessage(data: { id: number }) {
        queueMicrotask(() => {
            this.dispatchEvent(
                new MessageEvent("message", {
                    data: { type: "CHECK_RESULT", id: data.id, misspelled: [] },
                }),
            );
        });
    }
    terminate() {}
}

const syncWorker = new SyncWorker() as unknown as Worker;

function makeEditor(content: JSONContent[]) {
    return createTestEditor(
        [
            ...BASE_EXTENSIONS,
            ScriptioPagination.configure({
                pageGap: 20,
                headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
                customHeader: {
                    1: {
                        headerLeft: "",
                        headerRight: `<p class="page-number" style="margin-top: 50px;"></p>`,
                    },
                },
                footerRight: "",
                ...SCREENPLAY_FORMATS.LETTER,
            }),
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            createSpellcheckExtension({
                getWorker: () => syncWorker,
                getEnabled: () => true,
                getCharacters: () => undefined,
            }),
        ],
        content,
    );
}

pluginBenchSuite("spellcheck — apply() timing", makeEditor);
