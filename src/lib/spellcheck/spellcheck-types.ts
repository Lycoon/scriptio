/** Dictionary catalog entry */
export interface DictionaryInfo {
    /** Language code, e.g. "en", "en-GB" */
    code: string;
    /** Human-readable name, e.g. "English" */
    name: string;
}

/** Metadata for a locally installed dictionary */
export interface InstalledDictionary {
    code: string;
    /** Combined size of .aff + .dic in bytes */
    size: number;
    installedAt: number;
}

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
