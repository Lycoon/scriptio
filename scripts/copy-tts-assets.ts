/**
 * Vendors the onnxruntime-web WASM that Kokoro (via Transformers.js) needs into
 * `public/tts/ort/`, so inference works offline inside the Tauri static export —
 * the same locality guarantee as the bundled spellcheck dictionary. The espeak
 * phonemizer is embedded in the `phonemizer` package, so nothing extra is needed
 * there, and Kokoro's model + voices are cached by Transformers.js on first use.
 *
 * The wasm is copied straight from the exact Transformers.js build, so the
 * filenames/version always match what it loads. Paths here must match the
 * `WASM_PATHS` in src/lib/tts/kokoro.ts.
 */
import { existsSync, mkdirSync, copyFileSync, rmSync } from "fs";
import { join } from "path";

const PUBLIC_TTS = join("public", "tts");
const ORT_DIR = join(PUBLIC_TTS, "ort");

const ORT_SRC = join("node_modules", "@huggingface", "transformers", "dist");
// Transformers.js loads the jsep build for the wasm backend (wasm + its loader).
const ORT_FILES = ["ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"];

// Clear any previously vendored runtime (e.g. from a different engine/version)
// so stale, mismatched wasm can't linger.
rmSync(PUBLIC_TTS, { recursive: true, force: true });
mkdirSync(ORT_DIR, { recursive: true });

for (const file of ORT_FILES) {
    const src = join(ORT_SRC, file);
    if (!existsSync(src)) {
        console.warn(`[tts-assets] missing ORT file (skipped): ${src}`);
        continue;
    }
    copyFileSync(src, join(ORT_DIR, file));
    console.log(`[tts-assets] copied ${file}`);
}

console.log("[tts-assets] done");
