export type { DictionaryInfo, InstalledDictionary } from "@src/lib/utils/types";

// ---- Worker messages (main thread → worker) ----

export type SpellWorkerRequest =
    | { type: "INIT"; affData: ArrayBuffer; dicData: ArrayBuffer }
    | { type: "CHECK"; id: number; words: string[] }
    | { type: "SUGGEST"; word: string }
    | { type: "ADD_WORD"; word: string }
    | { type: "REMOVE_WORD"; word: string };

// ---- Worker messages (worker → main thread) ----

export type SpellWorkerResponse =
    | { type: "READY" }
    | { type: "CHECK_RESULT"; id: number; misspelled: string[] }
    | { type: "SUGGEST_RESULT"; word: string; suggestions: string[] }
    | { type: "ERROR"; error: string };
