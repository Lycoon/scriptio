"use client";

import type { Node as PMNode } from "@tiptap/pm/model";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { synthesize } from "./kokoro";
import { defaultVoiceForCharacter, VOICE_CATALOG } from "./voice-catalog";

/** All synthesizable voice ids — the pool per-character defaults are drawn from. */
const CATALOG_VOICE_IDS = VOICE_CATALOG.map((v) => v.voiceId);

export type ReadAloudState = "idle" | "preparing" | "playing" | "paused" | "done";

/** A tiny valid silent WAV, used once to unlock audio within the play gesture. */
const SILENT_WAV =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export interface ReadAloudSegment {
    index: number;
    type: ScreenplayElement;
    text: string;
    voiceId: string;
    /** Speaking character (upper-cased), when the segment is dialogue. */
    character?: string;
    /** ProseMirror position just before the source node (for highlight/scroll). */
    from: number;
    /** ProseMirror position just after the source node. */
    to: number;
    /**
     * When set, the segment is a silent gap of this many milliseconds rather
     * than synthesised speech — left for the user to perform an unselected
     * character's line themselves (rehearsal mode). `voiceId` is empty.
     */
    pauseMs?: number;
}

/** Which narration element types the narrator should read aloud. */
export interface NarrationOptions {
    action: boolean;
    scene: boolean;
    transition: boolean;
    /** Read by the narrator alongside the character's dialogue (a stage direction). */
    parenthetical: boolean;
}

export interface BuildOptions {
    /** UPPERCASE character name → voiceId. */
    characterVoices: Record<string, string>;
    /** Voice used for narration and for un-assigned speakers. */
    narratorVoiceId: string | null;
    /** Per-type toggles for non-dialogue narration (all off = table-read). */
    narration: NarrationOptions;
    /** UPPERCASE names whose dialogue (and parentheticals) should be skipped. */
    excludedCharacters?: Set<string>;
    /**
     * Rehearsal mode: instead of skipping excluded characters' dialogue, leave a
     * silent gap sized to the line so the reader can perform their part in time.
     */
    rehearsePauses?: boolean;
}

/**
 * Rough spoken duration of a line, used to size the silent gap left for the
 * reader to perform an unselected character's dialogue. ~150 wpm (≈400ms/word)
 * with a short floor so even one-word cues get a beat.
 */
const estimateSpeechMs = (text: string): number => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(700, Math.round(words * 400));
};

/** Strip parenthetical extensions like "(V.O.)" and upper-case, matching getCharacterNames. */
const cleanName = (raw: string): string =>
    raw.toUpperCase().trim().replace(/\s*\(.*?\)\s*$/, "").trim();

/**
 * Walk the screenplay document into an ordered list of voiced segments. A
 * `character` node sets the current speaker for the dialogue/parenthetical that
 * follow; narration nodes reset it. Dual-dialogue columns are descended into.
 *
 * Walking the live ProseMirror doc (rather than the screenplay JSON) gives each
 * segment its node range, used to highlight + scroll the editor while reading.
 *
 * @param doc       The editor's ProseMirror document.
 * @param startFrom Skip nodes that end at/before this position (the cursor), so
 *                  playback begins where the cursor sits. Speaker tracking still
 *                  runs over skipped nodes so the first read line keeps its voice.
 */
export function buildSegments(doc: PMNode, opts: BuildOptions, startFrom = 0): ReadAloudSegment[] {
    const segments: ReadAloudSegment[] = [];
    let current: string | null = null;

    const push = (
        type: ScreenplayElement,
        text: string,
        voiceId: string | null,
        from: number,
        nodeSize: number,
        character?: string,
    ) => {
        const trimmed = text.trim();
        if (!trimmed || !voiceId) return;
        // Drop nodes that end before the cursor (speaker tracking already ran).
        if (from + nodeSize <= startFrom) return;
        segments.push({ index: segments.length, type, text: trimmed, voiceId, character, from, to: from + nodeSize });
    };

    // A silent gap standing in for an unselected character's line (rehearsal).
    const pushPause = (text: string, from: number, nodeSize: number, character?: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        if (from + nodeSize <= startFrom) return;
        segments.push({
            index: segments.length,
            type: ScreenplayElement.Dialogue,
            text: trimmed,
            voiceId: "",
            character,
            from,
            to: from + nodeSize,
            pauseMs: estimateSpeechMs(trimmed),
        });
    };

    // A speaker's voice: their explicit assignment, else a stable per-character
    // default (independent of the narrator), else the narrator as a last resort.
    const resolveVoice = (speaker: string | null): string | null =>
        (speaker && opts.characterVoices[speaker]) ||
        (speaker && defaultVoiceForCharacter(speaker, CATALOG_VOICE_IDS)) ||
        opts.narratorVoiceId;

    const walk = (node: PMNode, contentStart: number) => {
        node.forEach((child, offset) => {
            const from = contentStart + offset;
            const type = child.attrs?.["class"] as ScreenplayElement | undefined;
            const text = child.textContent;

            switch (type) {
                case ScreenplayElement.Character:
                    current = cleanName(text);
                    break;
                case ScreenplayElement.Dialogue: {
                    if (current && opts.excludedCharacters?.has(current)) {
                        // Rehearsal mode leaves a timed silent gap for the reader
                        // to speak; otherwise the line is skipped entirely.
                        if (opts.rehearsePauses) pushPause(text, from, child.nodeSize, current ?? undefined);
                        break;
                    }
                    push(type, text, resolveVoice(current), from, child.nodeSize, current ?? undefined);
                    break;
                }
                case ScreenplayElement.Parenthetical: {
                    if (!opts.narration.parenthetical) break;
                    if (current && opts.excludedCharacters?.has(current)) break;
                    // Parentheticals are stage directions, so the narrator reads
                    // them rather than the character (whose voice speaks only the
                    // dialogue itself). Still attributed to the speaker for display.
                    push(type, text, opts.narratorVoiceId, from, child.nodeSize, current ?? undefined);
                    break;
                }
                case ScreenplayElement.Scene:
                    current = null;
                    if (opts.narration.scene) push(type, text, opts.narratorVoiceId, from, child.nodeSize);
                    break;
                case ScreenplayElement.Action:
                    current = null;
                    if (opts.narration.action) push(type, text, opts.narratorVoiceId, from, child.nodeSize);
                    break;
                case ScreenplayElement.Transition:
                    current = null;
                    if (opts.narration.transition) push(type, text, opts.narratorVoiceId, from, child.nodeSize);
                    break;
                case ScreenplayElement.DualDialogue:
                    // Each child is a column whose content holds character/dialogue
                    // nodes; +1 enters the dual-dialogue node's content.
                    walk(child, from + 1);
                    current = null;
                    break;
                // section, note and anything else: not voiced.
                default:
                    break;
            }
        });
    };

    walk(doc, 0);
    return segments;
}

export interface PlayerCallbacks {
    onSegmentChange?: (index: number) => void;
    onStateChange?: (state: ReadAloudState) => void;
}

/**
 * Drives a read-aloud session. Clips are synthesised **on-the-fly** in document
 * order — each segment is generated just before it's needed and the next one is
 * prefetched while the current plays, so playback starts almost immediately and
 * the main thread never stalls (synthesis happens in workers via `synthesize`).
 * Playback runs through a single <audio> element with volume / pause / stop.
 */
export class ReadAloudPlayer {
    private segments: ReadAloudSegment[] = [];
    // Memoised in-flight/finished clips, keyed by segment index.
    private cache = new Map<number, Promise<Blob>>();
    private url: string | null = null;
    private audio: HTMLAudioElement;
    private cursor = 0;
    // Monotonic token: bumped by start()/stop() so async work from a previous
    // run is discarded instead of hijacking the current one.
    private runId = 0;
    private _volume = 1;
    // Silent-gap (rehearsal) bookkeeping for the current segment.
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private silenceRemaining = 0;
    private silenceStartedAt = 0;
    private currentIsPause = false;
    state: ReadAloudState = "idle";

    constructor(private cb: PlayerCallbacks = {}) {
        this.audio = typeof Audio !== "undefined" ? new Audio() : ({} as HTMLAudioElement);
        this.audio.volume = this._volume;
        this.audio.addEventListener?.("ended", () => {
            if (this.state === "playing") void this.playFrom(this.cursor + 1, this.runId);
        });
        this.audio.addEventListener?.("error", () =>
            console.error("[ReadAloud] audio element error:", this.audio.error),
        );
    }

    // Plays a momentary silent clip within the user gesture to satisfy autoplay
    // policies; only needed once per element.
    private unlocked = false;
    private unlock(): void {
        if (this.unlocked || !this.audio.play) return;
        this.unlocked = true;
        try {
            this.audio.src = SILENT_WAV;
            void this.audio
                .play()
                .then(() => {
                    // Only pause if we're still on the silent unlock clip — once a
                    // real segment has taken over the element (fast synthesis), its
                    // currentSrc is a blob: URL and we must NOT pause it.
                    const onUnlockClip = !this.audio.currentSrc || this.audio.currentSrc.startsWith("data:");
                    if (onUnlockClip) this.audio.pause();
                    console.debug("[ReadAloud] audio unlocked (autoplay gesture satisfied)");
                })
                .catch((err) => console.warn("[ReadAloud] audio unlock failed (autoplay may block playback):", err));
        } catch (err) {
            console.warn("[ReadAloud] audio unlock threw:", err);
        }
    }

    get volume(): number {
        return this._volume;
    }

    setVolume(v: number): void {
        this._volume = Math.min(1, Math.max(0, v));
        this.audio.volume = this._volume;
    }

    start(segments: ReadAloudSegment[]): void {
        // Called synchronously from the play-button click — unlock audio here so
        // the real clip (which plays after async synthesis) isn't blocked by the
        // browser's autoplay policy.
        this.unlock();
        this.reset();
        const run = ++this.runId;
        this.segments = segments;
        console.info(`[ReadAloud] start — ${segments.length} segment(s), volume=${this._volume}`);
        if (segments.length === 0) {
            console.warn("[ReadAloud] nothing to play (0 segments)");
            this.setState("done");
            return;
        }
        void this.playFrom(0, run);
    }

    /** Lazily synthesise (and memoise) the clip for a segment. */
    private clip(i: number): Promise<Blob> {
        let p = this.cache.get(i);
        if (!p) {
            p = synthesize(this.segments[i].voiceId, this.segments[i].text);
            this.cache.set(i, p);
        }
        return p;
    }

    /** Synthesise a segment ahead of time, unless it's a silent gap. */
    private prefetch(i: number): void {
        const s = this.segments[i];
        if (s && s.pauseMs == null) void this.clip(i).catch(() => {});
    }

    private async playFrom(i: number, run: number): Promise<void> {
        if (run !== this.runId) return;
        if (i >= this.segments.length) {
            this.setState("done");
            return;
        }
        this.cursor = i;

        // A silent gap (rehearsal mode): highlight the line, then wait out its
        // estimated duration before advancing. Real clips are prefetched during
        // the gap so speech resumes seamlessly.
        const seg = this.segments[i];
        if (seg.pauseMs != null) {
            this.currentIsPause = true;
            this.setState("playing");
            this.cb.onSegmentChange?.(i);
            this.startSilence(seg.pauseMs, run);
            return;
        }
        this.currentIsPause = false;

        const clip = this.clip(i);
        // Only surface a buffering state if the clip isn't already ready.
        let ready = false;
        void clip.then(() => {
            ready = true;
        });
        await Promise.resolve();
        if (run !== this.runId) return;
        if (!ready) this.setState("preparing");

        let blob: Blob;
        try {
            blob = await clip;
        } catch (err) {
            console.error("[ReadAloud] synthesis failed for segment", i, err);
            this.cache.delete(i);
            return this.playFrom(i + 1, run); // skip the failed line and continue
        }
        if (run !== this.runId) return;

        // Prefetch the next couple of segments so they're ready when this one
        // ends (the worker serialises them). A deeper buffer smooths over short
        // lines whose audio is briefer than their synthesis time.
        this.prefetch(i + 1);
        this.prefetch(i + 2);

        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        this.cache.delete(i); // the blob is now held alive by the object URL
        this.audio.src = this.url;
        this.audio.volume = this._volume;
        this.setState("playing");
        this.cb.onSegmentChange?.(i);
        if (blob.size <= 44) {
            // A 44-byte (header-only) WAV means the model produced no audio.
            console.warn(`[ReadAloud] segment ${i} produced empty audio (${blob.size} bytes)`);
        }
        void this.audio
            .play?.()
            .then(() =>
                console.debug(
                    `[ReadAloud] ▶ segment ${i}/${this.segments.length - 1} (${this.segments[i].voiceId}) — ` +
                        `${blob.size}B, vol=${this.audio.volume}, muted=${this.audio.muted}, ` +
                        `dur=${Number.isFinite(this.audio.duration) ? this.audio.duration.toFixed(1) : "?"}s, ` +
                        `readyState=${this.audio.readyState}`,
                ),
            )
            .catch((err) => console.error("[ReadAloud] audio playback failed (segment " + i + "):", err));
    }

    /** Start (or restart with `ms` remaining) the silent gap for a rehearsal line. */
    private startSilence(ms: number, run: number): void {
        this.clearSilence();
        this.silenceRemaining = ms;
        this.silenceStartedAt = Date.now();
        // Warm up the upcoming spoken clips while the reader performs this line.
        this.prefetch(this.cursor + 1);
        this.prefetch(this.cursor + 2);
        this.silenceTimer = setTimeout(() => {
            this.silenceTimer = null;
            if (run !== this.runId) return;
            void this.playFrom(this.cursor + 1, run);
        }, ms);
    }

    private clearSilence(): void {
        if (this.silenceTimer != null) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    /** Skip to the next segment that read-aloud will process. */
    next(): void {
        this.jumpTo(this.cursor + 1);
    }

    /** Skip back to the previous segment. */
    prev(): void {
        this.jumpTo(this.cursor - 1);
    }

    /** Jump to a segment during an active session (same run), and play it. */
    private jumpTo(i: number): void {
        if (this.state !== "playing" && this.state !== "paused") return;
        if (this.segments.length === 0) return;
        const target = Math.max(0, Math.min(this.segments.length - 1, i));
        // Cancel whatever is currently sounding/waiting; keep the run id so this
        // stays the same session and stale async work is still gated correctly.
        this.audio.pause?.();
        this.clearSilence();
        void this.playFrom(target, this.runId);
    }

    pause(): void {
        if (this.state !== "playing") return;
        if (this.currentIsPause) {
            // Freeze the silent gap, banking the time left to resume with.
            this.silenceRemaining -= Date.now() - this.silenceStartedAt;
            this.clearSilence();
        } else {
            this.audio.pause?.();
        }
        this.setState("paused");
    }

    resume(): void {
        if (this.state !== "paused") return;
        this.setState("playing");
        if (this.currentIsPause) {
            this.startSilence(Math.max(0, this.silenceRemaining), this.runId);
        } else {
            void this.audio.play?.().catch(() => {});
        }
    }

    stop(): void {
        this.runId++;
        this.audio.pause?.();
        this.reset();
        this.setState("idle");
    }

    private reset(): void {
        if (this.url) {
            URL.revokeObjectURL(this.url);
            this.url = null;
        }
        if (this.audio.removeAttribute) this.audio.removeAttribute("src");
        this.clearSilence();
        this.currentIsPause = false;
        this.segments = [];
        this.cache.clear();
        this.cursor = 0;
    }

    private setState(state: ReadAloudState): void {
        this.state = state;
        this.cb.onStateChange?.(state);
    }
}
