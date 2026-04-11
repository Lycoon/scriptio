import type { SpellWorkerRequest, SpellWorkerResponse } from "./spellcheck-types";

let hunspell: any = null;

function post(msg: SpellWorkerResponse) {
    self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<SpellWorkerRequest>) => {
    const msg = e.data;

    try {
        switch (msg.type) {
            case "INIT": {
                const { loadModule } = await import("hunspell-asm");
                const factory = await loadModule();
                const affPath = factory.mountBuffer(new Uint8Array(msg.affData), "dict.aff");
                const dicPath = factory.mountBuffer(new Uint8Array(msg.dicData), "dict.dic");
                hunspell = factory.create(affPath, dicPath);
                post({ type: "READY" });
                break;
            }

            case "CHECK": {
                if (!hunspell) {
                    post({ type: "ERROR", error: "Hunspell not initialized" });
                    break;
                }
                const misspelled = msg.words.filter((w) => !hunspell.spell(w));
                post({ type: "CHECK_RESULT", id: msg.id, misspelled });
                break;
            }

            case "SUGGEST": {
                if (!hunspell) {
                    post({ type: "SUGGEST_RESULT", word: msg.word, suggestions: [] });
                    break;
                }
                const suggestions: string[] = hunspell.suggest(msg.word);
                post({ type: "SUGGEST_RESULT", word: msg.word, suggestions: suggestions.slice(0, 8) });
                break;
            }

            case "ADD_WORD": {
                hunspell?.addWord(msg.word);
                break;
            }

            case "REMOVE_WORD": {
                hunspell?.removeWord(msg.word);
                break;
            }
        }
    } catch (err) {
        post({ type: "ERROR", error: err instanceof Error ? err.message : String(err) });
    }
};
