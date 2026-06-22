import type { DictionaryInfo } from "./spellcheck-types";

/**
 * Curated catalog of dictionaries available for download from wooorm/dictionaries.
 * Each entry maps to a folder at:
 *   https://github.com/wooorm/dictionaries/tree/main/dictionaries/{code}
 */
export const DICTIONARY_CATALOG: DictionaryInfo[] = [
    { code: "en", name: "English" },
    { code: "en-GB", name: "English (UK)" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "it", name: "Italiano" },
    { code: "pt", name: "Português" },
    { code: "pt-PT", name: "Português (PT)" },
    { code: "pl", name: "Polski" },
    { code: "nl", name: "Nederlands" },
    { code: "ru", name: "Русский" },
    { code: "uk", name: "Українська" },
    { code: "ko", name: "한국어" },
    { code: "sv", name: "Svenska" },
    { code: "da", name: "Dansk" },
];

const BASE_URL = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries";

/**
 * Dictionary shipped with the app under `public/dictionaries/{code}`. It is loaded
 * locally — no CDN download — so spell check works on first launch and fully offline.
 */
export const BUILTIN_DICTIONARY_CODE = "en";

/**
 * Load the bundled dictionary from the app's static assets. Resolves against the page
 * origin, which is the served Next app on web and the static export inside Tauri.
 */
export async function loadBuiltinDictionary(): Promise<{ aff: Uint8Array; dic: Uint8Array }> {
    const dir = `/dictionaries/${BUILTIN_DICTIONARY_CODE}`;
    const [aff, dic] = await Promise.all([
        fetch(`${dir}/index.aff`).then((r) => r.arrayBuffer()),
        fetch(`${dir}/index.dic`).then((r) => r.arrayBuffer()),
    ]);
    return { aff: new Uint8Array(aff), dic: new Uint8Array(dic) };
}

/**
 * Fetch a URL as Uint8Array with optional progress tracking.
 * Uses ReadableStream when available for byte-level progress.
 */
async function fetchWithProgress(
    url: string,
    onProgress?: (loaded: number) => void,
): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    // Try streaming for progress
    if (response.body && onProgress) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            onProgress(loaded);
        }

        const result = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }

    // Fallback: no streaming
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

/**
 * Download a dictionary's .aff and .dic files from wooorm/dictionaries.
 * Both files are fetched in parallel. Progress reports combined bytes loaded.
 */
export async function downloadDictionary(
    code: string,
    onProgress?: (loaded: number, total: number) => void,
): Promise<{ aff: Uint8Array; dic: Uint8Array }> {
    const entry = DICTIONARY_CATALOG.find((d) => d.code === code);
    if (!entry) {
        throw new Error(`Dictionary "${code}" not found in catalog`);
    }

    const affUrl = `${BASE_URL}/${code}/index.aff`;
    const dicUrl = `${BASE_URL}/${code}/index.dic`;

    let affLoaded = 0;
    let dicLoaded = 0;
    // Rough estimate; actual total is unknown until Content-Length headers arrive
    let estimatedTotal = 0;

    // Try to get Content-Length for progress estimation
    try {
        const [affHead, dicHead] = await Promise.all([
            fetch(affUrl, { method: "HEAD" }),
            fetch(dicUrl, { method: "HEAD" }),
        ]);
        const affSize = parseInt(affHead.headers.get("content-length") || "0", 10);
        const dicSize = parseInt(dicHead.headers.get("content-length") || "0", 10);
        estimatedTotal = affSize + dicSize;
    } catch {
        // HEAD request failed, proceed without total estimate
    }

    const reportProgress = () => {
        onProgress?.(affLoaded + dicLoaded, estimatedTotal || affLoaded + dicLoaded);
    };

    const [aff, dic] = await Promise.all([
        fetchWithProgress(affUrl, (loaded) => {
            affLoaded = loaded;
            reportProgress();
        }),
        fetchWithProgress(dicUrl, (loaded) => {
            dicLoaded = loaded;
            reportProgress();
        }),
    ]);

    return { aff, dic };
}

/**
 * Format byte size for display (e.g. "2.1 MB", "450 KB").
 */
export function formatDictionarySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
