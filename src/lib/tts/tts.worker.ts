/**
 * Read-aloud synthesis worker (Kokoro-82M via kokoro-js / Transformers.js).
 *
 * Loads the shared model once on the fastest runtime that actually works (see
 * `load` — it smoke-tests WebGPU and falls back to wasm), then synthesises any
 * voice. All model download and ONNX inference run here so the editor stays
 * responsive. Synthesis requests are serialised so prefetched segments don't run
 * concurrently on the shared model.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

// Drop known-benign third-party warnings that otherwise spam the console during
// model load (a missing content-length header, and WebGPU's powerPreference
// being ignored on Windows). Neither indicates a problem.
const BENIGN_WARNINGS = ["Unable to determine content-length", "powerPreference option is currently ignored"];
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && BENIGN_WARNINGS.some((w) => (args[0] as string).includes(w))) return;
    originalWarn(...args);
};

type WorkerRequest =
    | { type: "LOAD"; modelId: string; device: "webgpu" | "wasm"; dtype: string; wasmPaths: string }
    | { type: "SYNTH"; id: number; voiceId: string; text: string };

const post = (msg: unknown, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(msg, transfer ?? []);

let tts: any = null;
let loadPromise: Promise<void> | null = null;
// The variant currently loaded (`device/dtype`), so we only reload on a change.
let loadedKey: string | null = null;
// Serialises generate() calls — transformers.js shares one ONNX session.
let chain: Promise<void> = Promise.resolve();
// How many synth requests are queued/in-flight (queue-depth diagnostics).
let pendingSynths = 0;
// The device/dtype actually committed to, for diagnostics.
let activeDevice = "";
let activeDtype = "";

/** Peak amplitude of an audio buffer (sub-sampled), used to detect silence. */
function peakAmplitude(data: Float32Array | undefined): number {
    if (!data || data.length === 0) return 0;
    let max = 0;
    const step = Math.max(1, Math.floor(data.length / 2000));
    for (let k = 0; k < data.length; k += step) {
        const a = Math.abs(data[k]);
        if (a > max) max = a;
    }
    return max;
}

async function load(req: Extract<WorkerRequest, { type: "LOAD" }>): Promise<void> {
    const onnx = env.backends?.onnx;
    if (onnx) {
        // Suppress ORT's benign "node not assigned to preferred EP" warnings
        // (shape ops always run on CPU). Real errors still surface.
        onnx.logLevel = "error";
        if (onnx.wasm) onnx.wasm.wasmPaths = req.wasmPaths;
    }
    env.allowLocalModels = false;
    env.allowRemoteModels = true;

    const label = `${req.device}/${req.dtype}`;
    // CPU (wasm) throughput hinges on multi-threading, which needs SharedArrayBuffer
    // + cross-origin isolation. Without it ONNX Runtime falls back to ONE thread,
    // which is the usual reason short lines still take seconds to synthesise.
    const wasm = onnx?.wasm as { numThreads?: number; simd?: boolean; proxy?: boolean } | undefined;
    const coi = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    console.info(
        `[TTS/worker] LOAD ${label} — env: crossOriginIsolated=${coi}, ` +
            `SharedArrayBuffer=${typeof SharedArrayBuffer !== "undefined"}, ` +
            `hardwareConcurrency=${navigator.hardwareConcurrency}, ` +
            `wasm.numThreads=${wasm?.numThreads}, wasm.simd=${wasm?.simd}, wasm.proxy=${wasm?.proxy}`,
    );

    // Report download progress for the model weights only (the dominant ~300MB
    // .onnx file). The small auxiliary files (config, tokenizer, voices) download
    // first and finish instantly — reporting them would briefly show 100% before
    // the real download even starts. If no progress events fire, the model came
    // from cache (instantiation only).
    let downloaded = false;
    const progress_callback = (p: any) => {
        if (p?.status === "progress" && typeof p.file === "string" && p.file.endsWith(".onnx")) {
            downloaded = true;
            post({ type: "PROGRESS", loaded: p.loaded ?? 0, total: p.total ?? 0 });
        }
    };

    const t0 = performance.now();
    const session = await KokoroTTS.from_pretrained(req.modelId, {
        dtype: req.dtype as any,
        device: req.device,
        progress_callback,
    });
    const loadMs = Math.round(performance.now() - t0);
    const source = downloaded ? "downloaded" : "from cache";
    // Effective thread count ORT settled on (after the wasm backend initialised).
    const threads = (env.backends?.onnx?.wasm as { numThreads?: number } | undefined)?.numThreads;
    // Some GPUs load the model yet emit silence — verify the GPU path actually
    // produces audio before committing to it. The CPU path is reliable as-is.
    // WebGPU's first inference can warm up silent, so retry a few times before
    // declaring the variant broken (a single cold attempt isn't conclusive).
    if (req.device === "webgpu") {
        const ts = performance.now();
        let peak = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
            peak = peakAmplitude((await session.generate("Hello there, this is a test.", { voice: "af_heart" }))?.audio);
            if (peak > 0.01) break;
            console.warn(`[TTS/worker] ${label} smoke-test attempt ${attempt}/3 silent (peak ${peak.toFixed(4)}) — retrying`);
        }
        console.info(
            `[TTS/worker] ${label} smoke-test: peak=${peak.toFixed(4)} in ${Math.round(performance.now() - ts)}ms (model ready in ${loadMs}ms, ${source})`,
        );
        if (peak <= 0.01) throw new Error(`${label} produced silent audio (peak ${peak.toFixed(4)})`);
    } else {
        console.info(`[TTS/worker] ${label} model ready in ${loadMs}ms (${source}, effective threads=${threads})`);
    }
    tts = session;
    activeDevice = req.device;
    activeDtype = req.dtype;
    console.info(`[TTS/worker] ✓ using ${label}`);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
    const msg = e.data;

    if (msg.type === "LOAD") {
        const key = `${msg.device}/${msg.dtype}`;
        void (async () => {
            try {
                // Reload only when switching to a different variant.
                if (loadedKey !== key || !loadPromise) {
                    loadedKey = key;
                    loadPromise = load(msg);
                }
                await loadPromise;
                post({ type: "READY", device: activeDevice, dtype: activeDtype });
            } catch (err) {
                loadPromise = null;
                loadedKey = null;
                post({ type: "LOAD_ERROR", error: err instanceof Error ? err.message : String(err) });
            }
        })();
        return;
    }

    if (msg.type === "SYNTH") {
        // Requests are serialised on `chain` (one ONNX session). Track when this
        // one was enqueued and how many are waiting ahead of it, so the log shows
        // whether time is spent generating vs queued behind earlier segments.
        const tEnqueued = performance.now();
        pendingSynths++;
        const queuedAhead = pendingSynths - 1;
        chain = chain.then(async () => {
            try {
                if (!loadPromise) {
                    post({ type: "ERROR", id: msg.id, error: "Model not loaded" });
                    return;
                }
                await loadPromise;
                const waitMs = Math.round(performance.now() - tEnqueued);
                const t0 = performance.now();
                const audio = await tts.generate(msg.text, { voice: msg.voiceId as any });
                const genMs = Math.round(performance.now() - t0);
                const samples: Float32Array | undefined = audio?.audio;
                const peak = peakAmplitude(samples);
                const seconds = samples && audio?.sampling_rate ? samples.length / audio.sampling_rate : 0;
                const chars = msg.text.length;
                const genSec = genMs / 1000 || 1e-3;
                const buffer: ArrayBuffer = audio.toWav();
                console.debug(
                    `[TTS/worker] SYNTH #${msg.id} ${activeDevice}/${activeDtype} chars=${chars} ` +
                        `wait=${waitMs}ms gen=${genMs}ms ` +
                        `(${Math.round(chars / genSec)} ch/s, ${(seconds / genSec).toFixed(2)}× realtime) ` +
                        `queuedAhead=${queuedAhead} audio=${seconds.toFixed(1)}s peak=${peak.toFixed(3)} ` +
                        `"${msg.text.slice(0, 40)}"`,
                );
                if (peak <= 0.01) {
                    console.warn(`[TTS/worker] SYNTH #${msg.id} produced SILENT audio (peak ${peak.toFixed(4)}) on ${activeDevice}/${activeDtype}`);
                }
                post({ type: "RESULT", id: msg.id, buffer }, [buffer]);
            } catch (err) {
                console.error(`[TTS/worker] SYNTH #${msg.id} failed:`, err);
                post({ type: "ERROR", id: msg.id, error: err instanceof Error ? err.message : String(err) });
            } finally {
                pendingSynths--;
            }
        });
    }
};
