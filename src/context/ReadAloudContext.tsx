"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { defaultVoiceForLanguage, VOICE_CATALOG } from "@src/lib/tts/voice-catalog";
import {
    buildSegments,
    NarrationOptions,
    ReadAloudPlayer,
    ReadAloudSegment,
    ReadAloudState,
} from "@src/lib/tts/read-aloud-engine";
import {
    clearReadAloudHighlight,
    scrollReadAloudIntoView,
    setReadAloudHighlight,
} from "@src/lib/screenplay/extensions/read-aloud-highlight-extension";
import {
    disposeWorker,
    installModel as installKokoroModel,
    isModelInstalled,
    prepareModel,
    removeModel as removeKokoroModel,
    setActiveModel as setActiveKokoroModel,
} from "@src/lib/tts/kokoro";
import {
    HIGH_QUALITY_MODEL,
    hasWebGPU,
    MODEL_VARIANTS,
    ModelQuality,
} from "@src/lib/tts/runtime";
import { useLocale } from "@src/context/LocaleContext";

/** Quality variants in preferred order (best first). */
const QUALITY_ORDER: ModelQuality[] = ["high"];

const ASSIGN_KEY = "scriptio-tts-assignments";
const NARRATOR_KEY = "scriptio-tts-narrator";
const EXCLUDED_KEY = "scriptio-tts-excluded-characters";
const NARRATION_KEY = "scriptio-tts-narration-options";
const VOLUME_KEY = "scriptio-tts-volume";
const ACTIVE_MODEL_KEY = "scriptio-tts-active-model";

export type InstalledModels = Record<ModelQuality, boolean>;

const DEFAULT_NARRATION: NarrationOptions = { action: false, scene: false, transition: false, parenthetical: true };

const VALID_VOICE_IDS = new Set(VOICE_CATALOG.map((v) => v.voiceId));

export interface ReadAloudLine {
    index: number;
    total: number;
    character?: string;
    text: string;
}

interface ReadAloudContextValue {
    // Model management — two independently-installable quality variants.
    /** True when a usable model is installed + active (voices are available). */
    modelInstalled: boolean;
    /** Which variants are downloaded. */
    installedModels: InstalledModels;
    /** The variant used for synthesis, or null if none is installed. */
    activeModel: ModelQuality | null;
    /** The variant currently downloading, or null. */
    downloadingModel: ModelQuality | null;
    downloadProgress: { loaded: number; total: number } | null;
    /** Recommended variant for this machine (high with a GPU, else low). */
    recommendedModel: ModelQuality | null;
    /** Whether a usable WebGPU adapter was found (null while still probing). */
    gpuAvailable: boolean | null;
    installModel: (quality: ModelQuality) => Promise<void>;
    removeModel: (quality: ModelQuality) => Promise<void>;
    setActiveModel: (quality: ModelQuality) => void;
    /** All voice ids usable once a model is active (empty otherwise). */
    availableVoices: string[];

    // Assignment
    characterVoices: Record<string, string>;
    setCharacterVoice: (name: string, voiceId: string) => void;
    /** UPPERCASE names excluded from playback (their dialogue is skipped). */
    excludedCharacters: Set<string>;
    /** Toggle whether a single character is read aloud. */
    setCharacterEnabled: (name: string, enabled: boolean) => void;
    /** Enable/disable a whole set of characters at once (select/deselect all). */
    setAllCharactersEnabled: (names: string[], enabled: boolean) => void;
    /** Voice used for narration and for any character without an explicit pick. */
    narratorVoiceId: string | null;
    setNarratorVoiceId: (voiceId: string) => void;

    // Playback
    playbackState: ReadAloudState;
    currentLine: ReadAloudLine | null;
    volume: number;
    setVolume: (v: number) => void;
    narrationOptions: NarrationOptions;
    setNarrationOption: (key: keyof NarrationOptions, value: boolean) => void;
    /** Start a read-aloud session from the editor's cursor position. */
    play: (editor: Editor) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
}

const noop = () => {};

const ReadAloudContext = createContext<ReadAloudContextValue>({
    modelInstalled: false,
    installedModels: { high: false },
    activeModel: null,
    downloadingModel: null,
    downloadProgress: null,
    recommendedModel: null,
    gpuAvailable: null,
    installModel: async () => {},
    removeModel: async () => {},
    setActiveModel: noop,
    availableVoices: [],
    characterVoices: {},
    setCharacterVoice: noop,
    excludedCharacters: new Set(),
    setCharacterEnabled: noop,
    setAllCharactersEnabled: noop,
    narratorVoiceId: null,
    setNarratorVoiceId: noop,
    playbackState: "idle",
    currentLine: null,
    volume: 1,
    setVolume: noop,
    narrationOptions: DEFAULT_NARRATION,
    setNarrationOption: noop,
    play: noop,
    pause: noop,
    resume: noop,
    stop: noop,
});

const readJSON = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
};

export function ReadAloudProvider({ children }: { children: ReactNode }) {
    const { locale } = useLocale();

    const [installedModels, setInstalledModels] = useState<InstalledModels>({ high: false });
    const [activeModel, setActiveModelState] = useState<ModelQuality | null>(null);
    const [downloadingModel, setDownloadingModel] = useState<ModelQuality | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);
    const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);

    const modelInstalled = activeModel !== null;
    // The model runs on the GPU, so without one it isn't usable (no recommendation).
    const recommendedModel: ModelQuality | null = gpuAvailable ? "high" : null;

    // Drop any stale voice ids (e.g. left over from a previous TTS engine) so
    // synthesis never gets an id the current model rejects.
    const [characterVoices, setCharacterVoices] = useState<Record<string, string>>(() => {
        const raw = readJSON<Record<string, string>>(ASSIGN_KEY, {});
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => VALID_VOICE_IDS.has(v)));
    });
    const [narratorVoiceId, setNarratorVoiceIdState] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        const stored = window.localStorage.getItem(NARRATOR_KEY);
        return stored && VALID_VOICE_IDS.has(stored) ? stored : null;
    });
    // Characters the user has unchecked; their dialogue is skipped during playback.
    // Stored as UPPERCASE names so it matches the speaker tracking in buildSegments.
    const [excludedCharacters, setExcludedCharacters] = useState<Set<string>>(
        () => new Set(readJSON<string[]>(EXCLUDED_KEY, [])),
    );
    const [narrationOptions, setNarrationOptionsState] = useState<NarrationOptions>(() => ({
        ...DEFAULT_NARRATION,
        ...readJSON<Partial<NarrationOptions>>(NARRATION_KEY, {}),
    }));
    const [volume, setVolumeState] = useState<number>(() => {
        if (typeof window === "undefined") return 1;
        const stored = parseFloat(window.localStorage.getItem(VOLUME_KEY) ?? "");
        return Number.isFinite(stored) ? stored : 1;
    });

    const [playbackState, setPlaybackState] = useState<ReadAloudState>("idle");
    const [currentLine, setCurrentLine] = useState<ReadAloudLine | null>(null);

    const playerRef = useRef<ReadAloudPlayer | null>(null);
    const segmentsRef = useRef<ReadAloudSegment[]>([]);
    // The editor the active session reads from, for highlight + scroll.
    const editorRef = useRef<Editor | null>(null);

    const availableVoices = useMemo(
        () => (modelInstalled ? VOICE_CATALOG.map((v) => v.voiceId) : []),
        [modelInstalled],
    );

    const getPlayer = useCallback((): ReadAloudPlayer => {
        if (!playerRef.current) {
            playerRef.current = new ReadAloudPlayer({
                onStateChange: (s) => {
                    setPlaybackState(s);
                    if (s === "idle" || s === "done") {
                        setCurrentLine(null);
                        const ed = editorRef.current;
                        if (ed) clearReadAloudHighlight(ed);
                    }
                },
                onSegmentChange: (i) => {
                    const seg = segmentsRef.current[i];
                    if (seg) {
                        setCurrentLine({
                            index: i,
                            total: segmentsRef.current.length,
                            character: seg.character,
                            text: seg.text,
                        });
                        // Highlight + scroll the line being spoken into view.
                        const ed = editorRef.current;
                        if (ed) {
                            setReadAloudHighlight(ed, seg.from, seg.to);
                            scrollReadAloudIntoView(ed, seg.from);
                        }
                    }
                },
            });
            playerRef.current.setVolume(volume);
        }
        return playerRef.current;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect which variants are downloaded + GPU availability on mount, then
    // pick the active model (stored choice if still installed, else the
    // recommended one if installed, else whichever is).
    useEffect(() => {
        if (typeof window === "undefined") return;
        let cancelled = false;
        (async () => {
            try {
                const [installedFlags, gpu] = await Promise.all([
                    Promise.all(MODEL_VARIANTS.map((v) => isModelInstalled(v))),
                    hasWebGPU(),
                ]);
                if (cancelled) return;
                const installed: InstalledModels = { high: false };
                MODEL_VARIANTS.forEach((v, i) => (installed[v.quality] = installedFlags[i]));
                setInstalledModels(installed);
                setGpuAvailable(gpu);

                // Active = stored choice if still installed, else best installed.
                const stored = window.localStorage.getItem(ACTIVE_MODEL_KEY);
                const storedQuality = QUALITY_ORDER.find((q) => q === stored);
                const active: ModelQuality | null =
                    (storedQuality && installed[storedQuality] ? storedQuality : null) ??
                    QUALITY_ORDER.find((q) => installed[q]) ??
                    null;

                if (active) {
                    setActiveModelState(active);
                    setActiveKokoroModel(HIGH_QUALITY_MODEL);
                }
            } catch (err) {
                console.error("[ReadAloud] Failed to check models:", err);
            }
        })();
        return () => {
            cancelled = true;
            playerRef.current?.stop();
            void disposeWorker();
        };
    }, []);

    const persistAssignments = useCallback((next: Record<string, string>) => {
        setCharacterVoices(next);
        window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(next));
    }, []);

    const setNarratorVoiceId = useCallback((voiceId: string) => {
        setNarratorVoiceIdState(voiceId);
        window.localStorage.setItem(NARRATOR_KEY, voiceId);
    }, []);

    const persistActiveModel = useCallback((quality: ModelQuality | null) => {
        setActiveModelState(quality);
        if (quality) {
            window.localStorage.setItem(ACTIVE_MODEL_KEY, quality);
            setActiveKokoroModel(HIGH_QUALITY_MODEL);
        } else {
            window.localStorage.removeItem(ACTIVE_MODEL_KEY);
        }
    }, []);

    const installModel = useCallback(
        async (quality: ModelQuality) => {
            setDownloadingModel(quality);
            setDownloadProgress({ loaded: 0, total: 0 });
            try {
                await installKokoroModel(HIGH_QUALITY_MODEL, (loaded, total) =>
                    setDownloadProgress({ loaded, total }),
                );
                setInstalledModels((prev) => ({ ...prev, [quality]: true }));
                // A freshly downloaded model becomes the active one.
                persistActiveModel(quality);
                // Seed a default narrator the first time.
                setNarratorVoiceIdState((prev) => {
                    if (prev) return prev;
                    const fallback = VOICE_CATALOG[0]?.voiceId ?? null;
                    if (fallback) window.localStorage.setItem(NARRATOR_KEY, fallback);
                    return fallback;
                });
            } catch (err) {
                // e.g. a variant that loads but emits silence on this GPU — recoverable,
                // the user can pick another quality, so warn rather than error.
                console.warn("[ReadAloud] Could not enable voice model:", err);
            } finally {
                setDownloadingModel(null);
                setDownloadProgress(null);
            }
        },
        [persistActiveModel],
    );

    const removeModel = useCallback(
        async (quality: ModelQuality) => {
            playerRef.current?.stop();
            await removeKokoroModel(HIGH_QUALITY_MODEL);
            setInstalledModels((prev) => {
                const next = { ...prev, [quality]: false };
                // If the removed variant was active, fall back to the best
                // still-installed variant, otherwise leave no active model.
                setActiveModelState((curActive) => {
                    if (curActive !== quality) return curActive;
                    const fallback = QUALITY_ORDER.find((q) => q !== quality && next[q]) ?? null;
                    if (fallback) {
                        window.localStorage.setItem(ACTIVE_MODEL_KEY, fallback);
                        setActiveKokoroModel(HIGH_QUALITY_MODEL);
                    } else {
                        window.localStorage.removeItem(ACTIVE_MODEL_KEY);
                    }
                    return fallback;
                });
                return next;
            });
        },
        [],
    );

    const setActiveModel = useCallback(
        (quality: ModelQuality) => {
            if (!installedModels[quality]) return;
            persistActiveModel(quality);
        },
        [installedModels, persistActiveModel],
    );

    const setCharacterVoice = useCallback(
        (name: string, voiceId: string) => {
            persistAssignments({ ...characterVoices, [name.toUpperCase()]: voiceId });
        },
        [characterVoices, persistAssignments],
    );

    const setCharacterEnabled = useCallback(
        (name: string, enabled: boolean) => {
            setExcludedCharacters((prev) => {
                const next = new Set(prev);
                if (enabled) next.delete(name.toUpperCase());
                else next.add(name.toUpperCase());
                window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]));
                return next;
            });
        },
        [],
    );

    const setAllCharactersEnabled = useCallback(
        (names: string[], enabled: boolean) => {
            // Enabling clears every listed name from the exclusion set; disabling
            // adds them all. Names not listed keep their current state.
            setExcludedCharacters((prev) => {
                const next = new Set(prev);
                for (const name of names) {
                    if (enabled) next.delete(name.toUpperCase());
                    else next.add(name.toUpperCase());
                }
                window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]));
                return next;
            });
        },
        [],
    );

    const setVolume = useCallback((v: number) => {
        const clamped = Math.min(1, Math.max(0, v));
        setVolumeState(clamped);
        window.localStorage.setItem(VOLUME_KEY, String(clamped));
        playerRef.current?.setVolume(clamped);
    }, []);

    const setNarrationOption = useCallback((key: keyof NarrationOptions, value: boolean) => {
        setNarrationOptionsState((prev) => {
            const next = { ...prev, [key]: value };
            window.localStorage.setItem(NARRATION_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const play = useCallback(
        async (editor: Editor) => {
            // Resolve a valid narrator (guard against any stale/empty id).
            const fallback = defaultVoiceForLanguage(locale, availableVoices) ?? VOICE_CATALOG[0]?.voiceId;
            const narrator =
                narratorVoiceId && VALID_VOICE_IDS.has(narratorVoiceId) ? narratorVoiceId : fallback;
            if (!narrator || !editor || editor.isDestroyed || !activeModel) return;

            // Validate the model loads + produces audio before synthesising the whole
            // script. If it's broken on this GPU (e.g. fp16 silence), drop it and fall
            // back through the other installed variants so playback still works.
            setPlaybackState("preparing");
            let quality: ModelQuality | null = activeModel;
            const tried = new Set<ModelQuality>();
            let ready: ModelQuality | null = null;
            while (quality && !tried.has(quality)) {
                const current = quality;
                tried.add(current);
                try {
                    await prepareModel(HIGH_QUALITY_MODEL);
                    ready = current;
                    break;
                } catch (err) {
                    console.warn(`[ReadAloud] "${current}" voice model is unusable on this device:`, err);
                    setInstalledModels((prev) => ({ ...prev, [current]: false }));
                    quality = QUALITY_ORDER.find((q) => !tried.has(q) && installedModels[q]) ?? null;
                }
            }
            if (!ready) {
                // Nothing usable — clear the active model so the UI reflects it.
                persistActiveModel(null);
                setPlaybackState("idle");
                return;
            }
            if (ready !== activeModel) persistActiveModel(ready);

            // Keep only valid per-character overrides; the rest fall back to the narrator.
            const safeVoices = Object.fromEntries(
                Object.entries(characterVoices).filter(([, v]) => VALID_VOICE_IDS.has(v)),
            );
            // Start where the cursor is so playback picks up from the reader's spot.
            const cursor = editor.state.selection.from;
            const segments = buildSegments(
                editor.state.doc,
                {
                    characterVoices: safeVoices,
                    narratorVoiceId: narrator,
                    narration: narrationOptions,
                    excludedCharacters,
                },
                cursor,
            );
            segmentsRef.current = segments;
            editorRef.current = editor;
            getPlayer().start(segments);
        },
        [
            narratorVoiceId,
            locale,
            availableVoices,
            characterVoices,
            narrationOptions,
            excludedCharacters,
            activeModel,
            installedModels,
            persistActiveModel,
            getPlayer,
        ],
    );

    const pause = useCallback(() => playerRef.current?.pause(), []);
    const resume = useCallback(() => playerRef.current?.resume(), []);
    const stop = useCallback(() => playerRef.current?.stop(), []);

    const value = useMemo<ReadAloudContextValue>(
        () => ({
            modelInstalled,
            installedModels,
            activeModel,
            downloadingModel,
            downloadProgress,
            recommendedModel,
            gpuAvailable,
            installModel,
            removeModel,
            setActiveModel,
            availableVoices,
            characterVoices,
            setCharacterVoice,
            excludedCharacters,
            setCharacterEnabled,
            setAllCharactersEnabled,
            narratorVoiceId,
            setNarratorVoiceId,
            playbackState,
            currentLine,
            volume,
            setVolume,
            narrationOptions,
            setNarrationOption,
            play,
            pause,
            resume,
            stop,
        }),
        [
            modelInstalled,
            installedModels,
            activeModel,
            downloadingModel,
            downloadProgress,
            recommendedModel,
            gpuAvailable,
            installModel,
            removeModel,
            setActiveModel,
            availableVoices,
            characterVoices,
            setCharacterVoice,
            excludedCharacters,
            setCharacterEnabled,
            setAllCharactersEnabled,
            narratorVoiceId,
            setNarratorVoiceId,
            playbackState,
            currentLine,
            volume,
            setVolume,
            narrationOptions,
            setNarrationOption,
            play,
            pause,
            resume,
            stop,
        ],
    );

    return <ReadAloudContext.Provider value={value}>{children}</ReadAloudContext.Provider>;
}

export function useReadAloud() {
    return useContext(ReadAloudContext);
}
