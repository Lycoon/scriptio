"use client";

/**
 * Browser wrapper around `kokoro-js` (Kokoro-82M via Transformers.js).
 *
 * Kokoro is a single model (one download unlocks every voice), shipped in two
 * quality variants the user installs independently (see runtime.ts): a
 * high-quality fp32/WebGPU build and a low-quality q8/CPU build. The worker
 * (tts.worker.ts) loads whichever variant is active and synthesises segments
 * on-the-fly via `synthesize`, off the main thread so the editor never freezes.
 *
 * Storage: Transformers.js caches the model + voice embeddings in the browser
 * Cache API ("transformers-cache"), so after the first download everything is
 * available offline — the same locality guarantee as the spellcheck dictionaries.
 */

import { KOKORO_MODEL_ID } from "./voice-catalog";
import { ModelVariant } from "./runtime";

// onnxruntime-web wasm shipped by Transformers.js, vendored locally so synthesis
// works offline inside the Tauri static export (see scripts/copy-tts-assets.ts).
export const WASM_PATHS = "/tts/ort/";

const TRANSFORMERS_CACHE = "transformers-cache";
const MODEL_TAG = "Kokoro-82M"; // identifies our entries in the shared cache

// ── Worker wiring ────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let loadResolve: (() => void) | null = null;
let loadReject: ((e: Error) => void) | null = null;
let progressCb: ((loaded: number, total: number) => void) | null = null;
// The variant the worker is (re)loading/loaded, and the one synthesis should use.
let loadedFile: string | null = null;
let activeVariant: ModelVariant | null = null;
// When the current LOAD was posted, to time the load → ready round-trip.
let loadStartedAt = 0;

let nextRequestId = 0;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

interface WorkerMessage {
    type: "PROGRESS" | "READY" | "LOAD_ERROR" | "RESULT" | "ERROR";
    id?: number;
    loaded?: number;
    total?: number;
    buffer?: ArrayBuffer;
    error?: string;
    device?: string;
    dtype?: string;
}

/** The device/dtype the worker committed to, once loaded (for diagnostics/UI). */
export let activeRuntime: { device: string; dtype: string } | null = null;

function handleMessage(e: MessageEvent<WorkerMessage>) {
    const m = e.data;
    switch (m.type) {
        case "PROGRESS":
            progressCb?.(m.loaded ?? 0, m.total ?? 0);
            break;
        case "READY": {
            activeRuntime = { device: m.device ?? "?", dtype: m.dtype ?? "?" };
            const loadMs = loadStartedAt ? Math.round(performance.now() - loadStartedAt) : 0;
            console.info(
                `[TTS] model ready — running on ${activeRuntime.device}/${activeRuntime.dtype} (load took ${loadMs}ms)`,
            );
            loadResolve?.();
            loadResolve = loadReject = null;
            break;
        }
        case "LOAD_ERROR":
            loadReject?.(new Error(m.error ?? "Failed to load voice model"));
            loadResolve = loadReject = null;
            loadPromise = null; // allow a retry
            loadedFile = null;
            break;
        case "RESULT": {
            const req = m.id != null ? pending.get(m.id) : undefined;
            if (req && m.buffer) {
                pending.delete(m.id!);
                req.resolve(new Blob([m.buffer], { type: "audio/wav" }));
            }
            break;
        }
        case "ERROR": {
            const req = m.id != null ? pending.get(m.id) : undefined;
            if (req) {
                pending.delete(m.id!);
                req.reject(new Error(m.error ?? "TTS worker error"));
            }
            break;
        }
    }
}

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL("./tts.worker.ts", import.meta.url));
        worker.addEventListener("message", handleMessage as EventListener);
    }
    return worker;
}

/**
 * Ensure `variant` is loaded in the worker (downloads + caches on first run).
 * Reloads when switching variants; reuses the in-flight/finished load otherwise.
 */
function ensureLoaded(variant: ModelVariant, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    progressCb = onProgress ?? null;
    if (loadedFile !== variant.modelFile || !loadPromise) {
        loadedFile = variant.modelFile;
        loadPromise = (async () => {
            const w = getWorker();
            const ready = new Promise<void>((resolve, reject) => {
                loadResolve = resolve;
                loadReject = reject;
            });
            loadStartedAt = performance.now();
            console.info(`[TTS] loading ${variant.quality} model (${variant.device}/${variant.dtype})…`);
            w.postMessage({
                type: "LOAD",
                modelId: KOKORO_MODEL_ID,
                device: variant.device,
                dtype: variant.dtype,
                wasmPaths: WASM_PATHS,
            });
            return ready;
        })();
    }
    return loadPromise;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ask the browser to make this origin's storage persistent. The voice model is
 * a ~326 MB entry in the Cache API; under the default *best-effort* policy that
 * write can hit `QuotaExceededError` (Transformers.js swallows it with a console
 * warning, so the model loads for the session but is never persisted) or be
 * evicted between sessions — either way the app offers to download it again on
 * the next reload. Persistent storage raises the quota so the write succeeds and
 * marks the data non-evictable. Idempotent; a no-op where unavailable or already
 * granted. Chromium usually grants this silently based on site engagement;
 * Firefox may prompt.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
    try {
        if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
        if (await navigator.storage.persisted()) return true;
        const granted = await navigator.storage.persist();
        console.info(`[TTS] persistent storage ${granted ? "granted" : "denied"} for cached models`);
        return granted;
    } catch {
        return false;
    }
}

/** Whether this model variant is already downloaded (cached locally). */
export async function isModelInstalled(variant: ModelVariant): Promise<boolean> {
    if (typeof caches === "undefined") return false;
    try {
        const cache = await caches.open(TRANSFORMERS_CACHE);
        const keys = await cache.keys();
        return keys.some((r) => r.url.includes(MODEL_TAG) && r.url.endsWith(variant.modelFile));
    } catch {
        return false;
    }
}

/** Register which installed variant synthesis should use (loads lazily). */
export function setActiveModel(variant: ModelVariant): void {
    activeVariant = variant;
}

// Variants that loaded but failed validation on this GPU (e.g. fp16 emitting
// silence). Skipped without retrying until the page reloads.
const failedVariants = new Set<string>();

/**
 * Load a variant in the worker (downloading on first use) and make it active.
 * If it loads but produces silence on this GPU, it's remembered + purged so it
 * doesn't keep masquerading as installed and failing — and the error is rethrown.
 */
async function loadAndActivate(
    variant: ModelVariant,
    onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
    if (failedVariants.has(variant.modelFile)) {
        throw new Error(`${variant.quality} voice model is not supported on this GPU`);
    }
    try {
        await ensureLoaded(variant, onProgress);
        activeVariant = variant;
    } catch (err) {
        failedVariants.add(variant.modelFile);
        if (activeVariant?.modelFile === variant.modelFile) activeVariant = null;
        await purgeVariant(variant);
        throw err;
    }
}

/** Download + cache + activate a variant, reporting byte progress. */
export const installModel = (
    variant: ModelVariant,
    onProgress?: (loaded: number, total: number) => void,
): Promise<void> => loadAndActivate(variant, onProgress);

/** Ensure a (cached) variant is loaded + active, e.g. before starting playback. */
export const prepareModel = (variant: ModelVariant): Promise<void> => loadAndActivate(variant);

/** Delete a variant's cached model file (disposing the worker if it's loaded). */
async function purgeVariant(variant: ModelVariant): Promise<void> {
    if (loadedFile === variant.modelFile) await disposeWorker();
    if (typeof caches === "undefined") return;
    try {
        const cache = await caches.open(TRANSFORMERS_CACHE);
        const keys = await cache.keys();
        await Promise.all(
            keys
                .filter((r) => r.url.includes(MODEL_TAG) && r.url.endsWith(variant.modelFile))
                .map((r) => cache.delete(r)),
        );
    } catch {
        /* ignore */
    }
}

/** Delete a variant's cached model file (user-initiated removal). */
export async function removeModel(variant: ModelVariant): Promise<void> {
    if (activeVariant?.modelFile === variant.modelFile) activeVariant = null;
    await purgeVariant(variant);
}

/** Synthesise `text` with `voiceId` off the main thread, returning a WAV blob. */
export async function synthesize(voiceId: string, text: string): Promise<Blob> {
    if (!activeVariant) throw new Error("No active voice model");
    await ensureLoaded(activeVariant);
    const w = getWorker();
    const id = ++nextRequestId;
    const t0 = performance.now();
    return new Promise<Blob>((resolve, reject) => {
        pending.set(id, {
            resolve: (b) => {
                console.debug(
                    `[TTS] synth #${id} (${voiceId}) returned ${b.size}B in ${Math.round(performance.now() - t0)}ms ` +
                        `(${pending.size} still in flight)`,
                );
                resolve(b);
            },
            reject,
        });
        // Logged before the worker picks it up, so round-trip = queue wait + generate.
        console.debug(`[TTS] synth #${id} (${voiceId}) requested — ${pending.size} in flight, "${text.slice(0, 40)}"`);
        w.postMessage({ type: "SYNTH", id, voiceId, text });
    });
}

/** Tear down the worker (e.g. when leaving the project). */
export async function disposeWorker(): Promise<void> {
    worker?.terminate();
    worker = null;
    loadPromise = null;
    loadResolve = loadReject = null;
    loadedFile = null;
    pending.clear();
}
