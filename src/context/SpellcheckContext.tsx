"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { InstalledDictionary, SpellWorkerResponse } from "@src/lib/spellcheck/spellcheck-types";
import type { StorageProvider } from "@src/lib/persistence/storage-provider/storage-provider";

const LANG_KEY = "scriptio-spellcheck-lang";

interface SpellcheckContextValue {
    spellcheckLang: string | null;
    setSpellcheckLang: (code: string | null) => void;
    installedDictionaries: InstalledDictionary[];
    downloadProgress: { code: string; loaded: number; total: number } | null;
    installDictionary: (code: string) => Promise<void>;
    removeDictionary: (code: string) => Promise<void>;
    worker: Worker | null;
    isWorkerReady: boolean;
}

const SpellcheckContext = createContext<SpellcheckContextValue>({
    spellcheckLang: null,
    setSpellcheckLang: () => {},
    installedDictionaries: [],
    downloadProgress: null,
    installDictionary: async () => {},
    removeDictionary: async () => {},
    worker: null,
    isWorkerReady: false,
});

export function SpellcheckProvider({ children }: { children: ReactNode }) {
    const [spellcheckLang, setSpellcheckLangState] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(LANG_KEY);
    });

    const [installedDictionaries, setInstalledDictionaries] = useState<InstalledDictionary[]>([]);
    const [downloadProgress, setDownloadProgress] = useState<{
        code: string;
        loaded: number;
        total: number;
    } | null>(null);
    const [worker, setWorker] = useState<Worker | null>(null);
    const [isWorkerReady, setIsWorkerReady] = useState(false);

    const storeRef = useRef<StorageProvider | null>(null);
    const workerRef = useRef<Worker | null>(null);

    // Load the dictionary store and installed list on mount
    useEffect(() => {
        if (typeof window === "undefined") return;

        let cancelled = false;

        const init = async () => {
            const { getStorageProvider } = await import("@src/lib/persistence/storage-provider/storage-provider");
            const store = await getStorageProvider();
            storeRef.current = store;

            if (cancelled) return;

            const installed = await store.listInstalledDictionaries();
            if (!cancelled) {
                setInstalledDictionaries(installed);
            }
        };

        init().catch(console.error);

        return () => {
            cancelled = true;
        };
    }, []);

    // Initialize or swap the worker when the spellcheck language changes
    useEffect(() => {
        if (typeof window === "undefined" || !spellcheckLang || !storeRef.current) return;

        const store = storeRef.current;
        let cancelled = false;

        const initWorker = async () => {
            // Check if dictionary is installed
            const dictData = await store.loadDictionary(spellcheckLang);
            if (!dictData || cancelled) return;

            // Terminate old worker
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
                setWorker(null);
                setIsWorkerReady(false);
            }

            // Create new worker
            const w = new Worker(new URL("../lib/spellcheck/spellcheck.worker.ts", import.meta.url));

            const onMessage = (e: MessageEvent<SpellWorkerResponse>) => {
                if (e.data.type === "READY" && !cancelled) {
                    setIsWorkerReady(true);
                } else if (e.data.type === "ERROR") {
                    console.error("[Spellcheck] Worker error:", e.data.error);
                }
            };

            w.addEventListener("message", onMessage);

            // Transfer buffers to worker (avoids copy)
            const affBuffer = dictData.aff.buffer.slice(
                dictData.aff.byteOffset,
                dictData.aff.byteOffset + dictData.aff.byteLength,
            );
            const dicBuffer = dictData.dic.buffer.slice(
                dictData.dic.byteOffset,
                dictData.dic.byteOffset + dictData.dic.byteLength,
            );

            w.postMessage({ type: "INIT", affData: affBuffer, dicData: dicBuffer }, [affBuffer, dicBuffer]);

            workerRef.current = w;
            if (!cancelled) {
                setWorker(w);
            }
        };

        initWorker().catch(console.error);

        return () => {
            cancelled = true;
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
                setWorker(null);
                setIsWorkerReady(false);
            }
        };
    }, [spellcheckLang, installedDictionaries]);

    // Terminate worker when spellcheck is disabled
    useEffect(() => {
        if (!spellcheckLang && workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
            setWorker(null);
            setIsWorkerReady(false);
        }
    }, [spellcheckLang]);

    const setSpellcheckLang = useCallback((code: string | null) => {
        setSpellcheckLangState(code);
        if (code) {
            window.localStorage.setItem(LANG_KEY, code);
        } else {
            window.localStorage.removeItem(LANG_KEY);
        }
    }, []);

    const installDictionary = useCallback(
        async (code: string) => {
            if (!storeRef.current) return;

            const { downloadDictionary } = await import("@src/lib/spellcheck/spellcheck-dictionaries");

            setDownloadProgress({ code, loaded: 0, total: 0 });

            try {
                const { aff, dic } = await downloadDictionary(code, (loaded, total) => {
                    setDownloadProgress({ code, loaded, total });
                });

                await storeRef.current.saveDictionary(code, aff, dic);

                // Refresh installed list
                const installed = await storeRef.current.listInstalledDictionaries();
                setInstalledDictionaries(installed);

                // Auto-select the newly installed dictionary
                setSpellcheckLang(code);
            } catch (err) {
                console.error("[Spellcheck] Failed to download dictionary:", err);
            } finally {
                setDownloadProgress(null);
            }
        },
        [setSpellcheckLang],
    );

    const removeDictionary = useCallback(
        async (code: string) => {
            if (!storeRef.current) return;

            await storeRef.current.deleteDictionary(code);

            const installed = await storeRef.current.listInstalledDictionaries();
            setInstalledDictionaries(installed);

            // If the removed dictionary was active, disable spellcheck
            if (spellcheckLang === code) {
                setSpellcheckLang(null);
            }
        },
        [spellcheckLang, setSpellcheckLang],
    );

    const value = useMemo(
        () => ({
            spellcheckLang,
            setSpellcheckLang,
            installedDictionaries,
            downloadProgress,
            installDictionary,
            removeDictionary,
            worker,
            isWorkerReady,
        }),
        [
            spellcheckLang,
            setSpellcheckLang,
            installedDictionaries,
            downloadProgress,
            installDictionary,
            removeDictionary,
            worker,
            isWorkerReady,
        ],
    );

    return <SpellcheckContext.Provider value={value}>{children}</SpellcheckContext.Provider>;
}

export function useSpellcheck() {
    return useContext(SpellcheckContext);
}
