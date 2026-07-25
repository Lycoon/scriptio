"use client";

/**
 * Speech-to-text dictation into a Tiptap editor, backed by the browser's
 * built-in Web Speech API (`SpeechRecognition`). No network service of our own
 * is involved — Chrome/Safari stream the mic to their own recogniser and hand
 * back a transcript, which we insert at the cursor. Firefox has no
 * `SpeechRecognition`, so `isSupported` is false there and the UI hides the mic.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

// ── Minimal Web Speech typings ──────────────────────────────────────────────
// lib.dom.d.ts only ships these in newer TS releases (and never the `webkit`
// prefix), so we declare the slice we touch to stay portable.

interface SpeechRecognitionAlternativeLike {
    transcript: string;
}
interface SpeechRecognitionResultLike {
    readonly isFinal: boolean;
    readonly length: number;
    0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
    readonly resultIndex: number;
    readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
    readonly error: string;
}
interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getSpeechRecognitionCtor = (): SpeechRecognitionCtor | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** True when the current browser exposes the Web Speech recognition API. */
export const isDictationSupported = (): boolean => getSpeechRecognitionCtor() !== null;

// The recogniser wants a BCP-47 tag; our UI locales are bare language codes.
// Map the ones we ship to a sensible regional default, else pass through.
const LOCALE_TO_BCP47: Record<string, string> = {
    en: "en-US",
    fr: "fr-FR",
    es: "es-ES",
    de: "de-DE",
    ja: "ja-JP",
    ko: "ko-KR",
    pl: "pl-PL",
    zh: "zh-CN",
};

const resolveLang = (locale: string | null | undefined): string => {
    if (locale) {
        if (locale.includes("-")) return locale;
        const mapped = LOCALE_TO_BCP47[locale];
        if (mapped) return mapped;
    }
    return (typeof navigator !== "undefined" && navigator.language) || "en-US";
};

// The dictation language is a per-device preference (like the UI locale and
// spellcheck language), chosen in Language settings and read by the footer mic.
const DICTATION_LANG_KEY = "scriptio-dictation-lang";
const DEFAULT_DICTATION_LANG = "en";

/** The saved dictation language code, defaulting to English. */
export const getDictationLanguage = (): string => {
    if (typeof window === "undefined") return DEFAULT_DICTATION_LANG;
    return window.localStorage.getItem(DICTATION_LANG_KEY) || DEFAULT_DICTATION_LANG;
};

/** Persist the dictation language code. */
export const setDictationLanguage = (code: string): void => {
    if (typeof window !== "undefined") window.localStorage.setItem(DICTATION_LANG_KEY, code);
};

export interface Dictation {
    /** True only when the browser supports speech recognition. */
    isSupported: boolean;
    /** True while the mic is open and transcribing. */
    isListening: boolean;
    /** Start listening. `langOverride` (a UI code or BCP-47 tag) wins over the
     *  hook's `locale` for this session — used so a just-picked language takes
     *  effect immediately, before React re-renders the hook. */
    start: (langOverride?: string | null) => void;
    /** Stop listening (no-op when idle). */
    stop: () => void;
    /** Start listening if idle, stop if already listening. */
    toggle: () => void;
}

/**
 * Dictate into `editor` in `locale`. Final transcript segments are inserted at
 * the cursor as they arrive; interim (still-changing) results are ignored so the
 * document never churns. The recogniser is restarted transparently when the
 * browser ends a session on its own (e.g. a pause in speech) as long as the user
 * hasn't stopped, giving continuous dictation on browsers that time out.
 */
export const useDictation = (editor: Editor | null, locale: string | null | undefined): Dictation => {
    // Evaluated once on the client; nothing renders it during SSR.
    const [isSupported] = useState(() => isDictationSupported());
    const [isListening, setIsListening] = useState(false);

    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    // Whether the user still wants to listen — distinguishes a browser auto-stop
    // (which we resume) from an explicit stop (which we honour).
    const wantListeningRef = useRef(false);

    // Keep the latest editor/locale reachable from the long-lived event handlers
    // without re-creating the recogniser. Synced in an effect (not during render)
    // so React never sees a ref mutation mid-render.
    const editorRef = useRef(editor);
    const localeRef = useRef(locale);
    useEffect(() => {
        editorRef.current = editor;
        localeRef.current = locale;
    });

    const stop = useCallback(() => {
        wantListeningRef.current = false;
        const recognition = recognitionRef.current;
        if (!recognition) return;
        // Clear state up front: iOS WKWebView often doesn't fire `onend` after a
        // user-initiated stop, which would otherwise leave `isListening` stuck on
        // (the mic could never be toggled off). Dropping the ref and flag here
        // means the UI reflects "stopped" immediately regardless.
        recognitionRef.current = null;
        setIsListening(false);
        try {
            // `abort()` ends the session more reliably than `stop()` on iOS, which
            // may otherwise keep the recogniser (and the mic) alive.
            recognition.abort();
        } catch {
            // Already inactive — nothing to tear down.
        }
    }, []);

    const start = useCallback((langOverride?: string | null) => {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor || recognitionRef.current) return;

        const recognition = new Ctor();
        recognition.lang = resolveLang(langOverride ?? localeRef.current);
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const activeEditor = editorRef.current;
            if (!activeEditor || activeEditor.isDestroyed) return;
            let text = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) text += result[0].transcript;
            }
            text = text.trim();
            // Trailing space so successive phrases don't run together.
            if (text) activeEditor.chain().focus().insertContent(`${text} `).run();
        };

        recognition.onerror = (event) => {
            // A denied/unavailable mic won't recover on restart — stop trying.
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                wantListeningRef.current = false;
            }
        };

        recognition.onend = () => {
            // Browser ended the session. Resume if the user is still dictating,
            // otherwise clear state.
            if (wantListeningRef.current) {
                try {
                    recognition.start();
                    return;
                } catch {
                    // Fall through to teardown if it can't be restarted.
                }
            }
            recognitionRef.current = null;
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        wantListeningRef.current = true;
        try {
            recognition.start();
            setIsListening(true);
        } catch {
            recognitionRef.current = null;
            wantListeningRef.current = false;
        }
    }, []);

    const toggle = useCallback(() => {
        if (recognitionRef.current) stop();
        else start();
    }, [start, stop]);

    // Release the mic if the component unmounts mid-dictation.
    useEffect(
        () => () => {
            wantListeningRef.current = false;
            recognitionRef.current?.abort();
            recognitionRef.current = null;
        },
        [],
    );

    return { isSupported, isListening, start, stop, toggle };
};
