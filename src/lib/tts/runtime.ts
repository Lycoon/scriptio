"use client";

/**
 * Inference runtime for Kokoro.
 *
 * Read-aloud runs a single model: fp32 on WebGPU. It's the only variant that's
 * reliable across GPUs — fp16 emits silence on adapters that report but don't
 * truly support `shader-f16`, and the int8/q8 model produces garbled audio
 * through onnxruntime-web's WebGPU backend (it passes a loudness check yet speaks
 * gibberish). fp32 needs a GPU but is correct and fast, so it's what we ship.
 */

export type ModelQuality = "high";

export interface ModelVariant {
    quality: ModelQuality;
    device: "webgpu" | "wasm";
    /** kokoro-js / Transformers.js dtype. */
    dtype: string;
    /** ONNX filename Transformers.js fetches + caches. */
    modelFile: string;
    /** Download size in bytes. */
    size: number;
    /** Requires a working WebGPU adapter to run. */
    requiresGpu: boolean;
}

export const HIGH_QUALITY_MODEL: ModelVariant = {
    quality: "high",
    device: "webgpu",
    dtype: "fp32",
    modelFile: "model.onnx",
    size: 326_080_510,
    requiresGpu: true,
};

export const MODEL_VARIANTS: ModelVariant[] = [HIGH_QUALITY_MODEL];

let webgpuProbe: Promise<boolean> | null = null;

/** True if the browser exposes a usable WebGPU adapter (cached after first probe). */
export function hasWebGPU(): Promise<boolean> {
    return (webgpuProbe ??= (async () => {
        try {
            const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
            if (!gpu) return false;
            const adapter = await gpu.requestAdapter();
            return !!adapter;
        } catch {
            return false;
        }
    })());
}
