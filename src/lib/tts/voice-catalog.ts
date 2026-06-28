import { CharacterGender } from "@src/lib/screenplay/characters";
import { formatDictionarySize } from "@src/lib/spellcheck/spellcheck-dictionaries";

/**
 * Read-aloud voices, powered by Kokoro-82M (hexgrad/Kokoro-82M) via kokoro-js.
 *
 * Unlike Piper (one model per voice), Kokoro is a SINGLE shared model plus tiny
 * per-voice embeddings: the user downloads the model once and every voice below
 * becomes available. `kokoro-js` v1 supports the 28 English voices (US + UK),
 * so those are the ones we expose; `gender` drives automatic per-character
 * assignment.
 *
 * voiceId format: `{lang}{gender}_{name}` — a/b = American/British English,
 * f/m = female/male (e.g. af_heart, bm_george).
 */

/** Hugging Face repo for the ONNX build kokoro-js loads from. */
export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export interface VoiceInfo {
    voiceId: string;
    /** Flag emoji for the voice's accent. */
    flag: string;
    /** Speaker name, e.g. "Heart". */
    name: string;
    /** UI language code (all current voices are English). */
    language: string;
    gender: CharacterGender;
}

const F = CharacterGender.FEMALE;
const M = CharacterGender.MALE;
const US = "🇺🇸";
const GB = "🇬🇧";

// 🇺🇸 American English, 🇬🇧 British English. These are the voices kokoro-js can
// actually synthesize: its bundled espeak-ng phonemizer ships English-only data,
// so the model's other-language voices can't be driven in the browser.
export const VOICE_CATALOG: VoiceInfo[] = [
    // 🇺🇸 American — Female
    { voiceId: "af_heart", flag: US, name: "Heart", language: "en", gender: F },
    { voiceId: "af_bella", flag: US, name: "Bella", language: "en", gender: F },
    { voiceId: "af_nicole", flag: US, name: "Nicole", language: "en", gender: F },
    { voiceId: "af_aoede", flag: US, name: "Aoede", language: "en", gender: F },
    { voiceId: "af_kore", flag: US, name: "Kore", language: "en", gender: F },
    { voiceId: "af_sarah", flag: US, name: "Sarah", language: "en", gender: F },
    { voiceId: "af_nova", flag: US, name: "Nova", language: "en", gender: F },
    { voiceId: "af_sky", flag: US, name: "Sky", language: "en", gender: F },
    { voiceId: "af_alloy", flag: US, name: "Alloy", language: "en", gender: F },
    { voiceId: "af_jessica", flag: US, name: "Jessica", language: "en", gender: F },
    { voiceId: "af_river", flag: US, name: "River", language: "en", gender: F },
    // 🇺🇸 American — Male
    { voiceId: "am_adam", flag: US, name: "Adam", language: "en", gender: M },
    { voiceId: "am_michael", flag: US, name: "Michael", language: "en", gender: M },
    { voiceId: "am_fenrir", flag: US, name: "Fenrir", language: "en", gender: M },
    { voiceId: "am_puck", flag: US, name: "Puck", language: "en", gender: M },
    { voiceId: "am_echo", flag: US, name: "Echo", language: "en", gender: M },
    { voiceId: "am_eric", flag: US, name: "Eric", language: "en", gender: M },
    { voiceId: "am_liam", flag: US, name: "Liam", language: "en", gender: M },
    { voiceId: "am_onyx", flag: US, name: "Onyx", language: "en", gender: M },
    { voiceId: "am_santa", flag: US, name: "Santa", language: "en", gender: M },
    // 🇬🇧 British — Female
    { voiceId: "bf_emma", flag: GB, name: "Emma", language: "en", gender: F },
    { voiceId: "bf_isabella", flag: GB, name: "Isabella", language: "en", gender: F },
    { voiceId: "bf_alice", flag: GB, name: "Alice", language: "en", gender: F },
    { voiceId: "bf_lily", flag: GB, name: "Lily", language: "en", gender: F },
    // 🇬🇧 British — Male
    { voiceId: "bm_george", flag: GB, name: "George", language: "en", gender: M },
    { voiceId: "bm_daniel", flag: GB, name: "Daniel", language: "en", gender: M },
    { voiceId: "bm_lewis", flag: GB, name: "Lewis", language: "en", gender: M },
    { voiceId: "bm_fable", flag: GB, name: "Fable", language: "en", gender: M },
];

/** Re-exported so callers don't reach into the spellcheck module for size formatting. */
export const formatVoiceSize = formatDictionarySize;

export const getVoiceInfo = (voiceId: string): VoiceInfo | undefined =>
    VOICE_CATALOG.find((v) => v.voiceId === voiceId);

export type VoiceAccent = "american" | "british";

/** Accent group from the voiceId prefix (a* = American, b* = British). */
export const voiceAccent = (voiceId: string): VoiceAccent =>
    voiceId.startsWith("b") ? "british" : "american";

/** Human label for a voice (flag + name), falling back to the raw id. */
export const voiceLabel = (voiceId: string): string => {
    const info = getVoiceInfo(voiceId);
    return info ? `${info.flag} ${info.name}` : voiceId;
};

/** Pick a sensible default narrator/voice for a UI language from a set of voiceIds. */
export const defaultVoiceForLanguage = (language: string, available: string[]): string | undefined => {
    const inLang = available.find((id) => getVoiceInfo(id)?.language === language);
    return inLang ?? available[0];
};
