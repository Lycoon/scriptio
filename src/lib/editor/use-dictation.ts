"use client";

/**
 * Speech-to-text dictation into a Tiptap editor, backed by the browser's
 * built-in Web Speech API (`SpeechRecognition`). No network service of our own
 * is involved — Chrome/Safari stream the mic to their own recogniser and hand
 * back a transcript, which we insert at the cursor. Firefox has no
 * `SpeechRecognition`, so `isSupported` is false there and the UI hides the mic.
 *
 * The transcript arrives in two flavours: interim guesses, rewritten as the
 * recogniser hears more, and final segments it has settled on. Both are shown
 * as they arrive — interim words as a preview decoration at the caret, final
 * ones as real document text — so speech appears on the page continuously
 * rather than in bursts whenever the speaker pauses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { clearDictationPreview, commitDictationText, setDictationPreview } from "./dictation-preview-extension";

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
 * Dictate into `editor` in `locale`. Words appear as they are spoken: each
 * interim guess is previewed at the caret, and every segment the recogniser
 * settles on is inserted as real text, replacing the part of the preview it
 * covers. The recogniser is restarted transparently when the browser ends a
 * session on its own (e.g. a pause in speech) as long as the user hasn't
 * stopped, giving continuous dictation on browsers that time out.
 */
export const useDictation = (editor: Editor | null, locale: string | null | undefined): Dictation => {
    // Evaluated once on the client; nothing renders it during SSR.
    const [isSupported] = useState(() => isDictationSupported());
    const [isListening, setIsListening] = useState(false);

    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    // Whether the user still wants to listen — distinguishes a browser auto-stop
    // (which we resume) from an explicit stop (which we honour).
    const wantListeningRef = useRef(false);
    // Index of the first result of the current session not yet written to the
    // document. Tracked ourselves rather than trusting `event.resultIndex`, which
    // some engines rewind to 0 and would then re-insert settled phrases.
    const committedIndexRef = useRef(0);
    // The interim text currently being previewed, kept so it can be committed if
    // the session ends before the recogniser settles on it.
    const pendingRef = useRef("");

    // Keep the latest editor/locale reachable from the long-lived event handlers
    // without re-creating the recogniser. Synced in an effect (not during render)
    // so React never sees a ref mutation mid-render.
    const editorRef = useRef(editor);
    const localeRef = useRef(locale);
    useEffect(() => {
        // Switching panels mid-dictation moves the mic to another editor; the
        // preview belongs to the one we're leaving, so take it with us.
        if (editorRef.current !== editor) {
            clearDictationPreview(editorRef.current);
            pendingRef.current = "";
        }
        editorRef.current = editor;
        localeRef.current = locale;
    });

    // Write out whatever is being previewed. The recogniser only ever settles
    // results within a session, so anything still interim when one ends would be
    // lost otherwise — the writer said those words and saw them on the page.
    const flushPending = useCallback(() => {
        const pending = pendingRef.current;
        pendingRef.current = "";
        if (pending) commitDictationText(editorRef.current, `${pending} `);
        else clearDictationPreview(editorRef.current);
    }, []);

    const stop = useCallback(() => {
        wantListeningRef.current = false;
        const recognition = recognitionRef.current;
        if (!recognition) return;
        // Before `abort()`, which drops pending results without a final event.
        flushPending();
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
    }, [flushPending]);

    const start = useCallback(
        (langOverride?: string | null) => {
            const Ctor = getSpeechRecognitionCtor();
            if (!Ctor || recognitionRef.current) return;

            const recognition = new Ctor();
            recognition.lang = resolveLang(langOverride ?? localeRef.current);
            recognition.continuous = true;
            // Stream the recogniser's running guess instead of waiting for it to
            // settle, so the writer sees words land as they speak them.
            recognition.interimResults = true;

            recognition.onresult = (event) => {
                // Results settle in order, so everything from the first
                // uncommitted index on is either newly final or still interim.
                let settled = "";
                let interim = "";
                for (let i = committedIndexRef.current; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        settled += result[0].transcript;
                        committedIndexRef.current = i + 1;
                    } else {
                        interim += result[0].transcript;
                    }
                }
                interim = interim.trim();
                pendingRef.current = interim;

                const activeEditor = editorRef.current;
                if (!activeEditor || activeEditor.isDestroyed) return;
                settled = settled.trim();
                // Trailing space so successive phrases don't run together.
                if (settled) commitDictationText(activeEditor, `${settled} `, interim);
                else setDictationPreview(activeEditor, interim);
            };

            recognition.onerror = (event) => {
                // A denied/unavailable mic won't recover on restart — stop trying.
                if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                    wantListeningRef.current = false;
                }
            };

            recognition.onend = () => {
                // Browser ended the session: its results are gone, so anything
                // still interim has to be written out now and the next session
                // starts counting from zero again.
                flushPending();
                committedIndexRef.current = 0;
                // Resume if the user is still dictating, otherwise clear state.
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
            committedIndexRef.current = 0;
            pendingRef.current = "";
            try {
                recognition.start();
                setIsListening(true);
            } catch {
                recognitionRef.current = null;
                wantListeningRef.current = false;
            }
        },
        [flushPending],
    );

    const toggle = useCallback(() => {
        if (recognitionRef.current) stop();
        else start();
    }, [start, stop]);

    // Release the mic if the component unmounts mid-dictation. The preview is
    // dropped rather than committed: teardown isn't a moment to be editing the
    // document, and an orphaned decoration would otherwise sit in the editor.
    useEffect(
        () => () => {
            wantListeningRef.current = false;
            recognitionRef.current?.abort();
            recognitionRef.current = null;
            pendingRef.current = "";
            clearDictationPreview(editorRef.current);
        },
        [],
    );

    return { isSupported, isListening, start, stop, toggle };
};
