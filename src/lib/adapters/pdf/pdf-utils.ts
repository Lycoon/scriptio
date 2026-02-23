/**
 * Unicode script detection for PDF font selection.
 *
 * Maps characters to the correct font family based on their Unicode range,
 * mirroring the @font-face unicode-range declarations in styles/fonts.css.
 *
 * Font assignments:
 *   - CourierPrime (default)  — Latin, punctuation, symbols
 *   - CourierBadi             — Cyrillic + Arabic
 *   - Cousine                 — Greek + Hebrew
 *   - SarasaMonoSC            — CJK (Chinese, Japanese, Korean)
 */

/**
 * Font family name for a non-default script, or `null` for the
 * document default (CourierPrime). Using `null` avoids setting a
 * redundant `font` property on pdfMake fragments.
 */
export type ScriptFont = "FreeMono" | "Cousine" | "SarasaMonoSC" | null;

export interface ScriptSegment {
    text: string;
    font: ScriptFont;
}

/**
 * Determine which font family a Unicode code point requires.
 * Returns `null` when the default font (CourierPrime) handles the character.
 *
 * Ranges are checked in frequency order: Latin (fast path) first,
 * then smaller script blocks, then the large CJK ranges last.
 */
export const getFontForCodePoint = (cp: number): ScriptFont => {
    // ── Fast path: Latin + common symbols (vast majority of screenplay text) ──
    if (
        cp <= 0x024f || // ASCII + Latin-1 Supplement + Latin Extended-A/B
        (cp >= 0x1e00 && cp <= 0x1eff) || // Latin Extended Additional
        (cp >= 0x2000 && cp <= 0x218f) || // General Punctuation → Number Forms
        (cp >= 0x0400 && cp <= 0x052f) || // Cyrillic (also covers Cyrillic Supplement)
        (cp >= 0x2de0 && cp <= 0x2dff) || // Cyrillic Extended-A
        (cp >= 0xa640 && cp <= 0xa69f) // Cyrillic Extended-B
    ) {
        return null;
    }

    // ── Cousine: Greek ──
    // U+0370..03FF  Greek and Coptic
    // U+1F00..1FFF  Greek Extended
    if ((cp >= 0x0370 && cp <= 0x03ff) || (cp >= 0x1f00 && cp <= 0x1fff)) {
        return "Cousine";
    }

    // ── Cousine: Hebrew ──
    // U+0590..05FF  Hebrew
    // U+FB1D..FB4F  Hebrew Presentation Forms
    if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) {
        return "Cousine";
    }

    // ── CourierBadi: Arabic ──
    // U+0600..06FF  Arabic
    // U+0750..077F  Arabic Supplement
    // U+08A0..08FF  Arabic Extended-A
    // U+FB50..FDFF  Arabic Presentation Forms-A
    // U+FE70..FEFF  Arabic Presentation Forms-B
    if (
        (cp >= 0x0600 && cp <= 0x06ff) ||
        (cp >= 0x0750 && cp <= 0x077f) ||
        (cp >= 0x08a0 && cp <= 0x08ff) ||
        (cp >= 0xfb50 && cp <= 0xfdff) ||
        (cp >= 0xfe70 && cp <= 0xfeff)
    ) {
        return "FreeMono";
    }

    // ── NoroshiMono: CJK / Japanese / Korean ──
    if (
        (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
        (cp >= 0x2e80 && cp <= 0x2fff) || // CJK Radicals & Ideographic Description (Extended)
        (cp >= 0x3000 && cp <= 0x33ff) || // CJK Symbols/Kana/Bopomofo
        (cp >= 0x3400 && cp <= 0x4dbf) || // Extension A
        (cp >= 0x4e00 && cp <= 0x9fff) || // Unified Ideographs (Main)
        (cp >= 0xa960 && cp <= 0xa97f) || // Hangul Jamo Extended-A
        (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
        (cp >= 0xf900 && cp <= 0xfaff) || // Compatibility Ideographs
        (cp >= 0xfe30 && cp <= 0xfe4f) || // Compatibility Forms
        (cp >= 0xff00 && cp <= 0xffef) || // Halfwidth/Fullwidth
        (cp >= 0x20000 && cp <= 0x323af) // Extensions B through H (Modern limit)
    ) {
        return "SarasaMonoSC";
    }

    // ── Fallback: unrecognised scripts use the default font ──
    return null;
};

/**
 * Split a string into consecutive segments grouped by the font needed
 * to render them. Adjacent characters requiring the same font are merged
 * into a single segment.
 *
 * Characters handled by the default font (CourierPrime) have `font: null`.
 * Uses `codePointAt()` to correctly handle surrogate pairs (CJK Extension B+).
 */
export const splitByScript = (text: string): ScriptSegment[] => {
    if (!text) return [];

    const segments: ScriptSegment[] = [];
    let currentFont: ScriptFont = null;
    let start = 0;

    for (let i = 0; i < text.length; ) {
        const cp = text.codePointAt(i)!;
        const charLen = cp > 0xffff ? 2 : 1;
        const font = getFontForCodePoint(cp);

        if (i === 0) {
            currentFont = font;
        } else if (font !== currentFont) {
            segments.push({ text: text.slice(start, i), font: currentFont });
            currentFont = font;
            start = i;
        }

        i += charLen;
    }

    if (start < text.length) {
        segments.push({ text: text.slice(start), font: currentFont });
    }

    return segments;
};
