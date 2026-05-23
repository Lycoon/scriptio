/**
 * Token-based scene labeling for production lock.
 *
 * Every locked scene stores a `SceneToken` — a structural, mode-independent
 * encoding of its logical position in the screenplay. The display label is
 * derived from the token via `compileSceneLabel(token)`. Because letter case
 * is baked into each level (`lower: true | false`), toggling the global
 * `SceneNumberingStyle` setting never alters the label of an already-locked
 * scene.
 *
 * Convention
 * ----------
 * - `baseNumber` is the integer anchor (1, 2, 3, …) that the rest of the
 *   token attaches to.
 * - `prefixes` are letter levels rendered BEFORE the base. Stored
 *   **inner-first** — `prefixes[0]` is the letter closest to the base.
 *   Rendering reverses the array.
 * - `suffixes` are letter levels rendered AFTER the base. Stored
 *   **shallowest-first** — `suffixes[0]` is the letter immediately after
 *   the base.
 *
 * Cases are encoded per-level. Uppercase = "AFTER" depth; lowercase = a
 * wedge insertion that goes BEFORE its same-position uppercase sibling in
 * production order.
 *
 *   "1"     →  { base:1 }
 *   "1A"    →  { base:1, suffixes:[{1,U}] }
 *   "1B"    →  { base:1, suffixes:[{2,U}] }
 *   "1AA"   →  { base:1, suffixes:[{1,U},{1,U}] }  ← sub-scene of 1A, between 1A and 1B
 *   "1aA"   →  { base:1, suffixes:[{1,L},{1,U}] }  ← wedge between 1 and 1A
 *   "A2"    →  { base:2, prefixes:[{1,U}] }
 *   "AA2"   →  { base:2, prefixes:[{1,U},{1,U}] }  ← deeper before A2, between 1 and A2
 *
 * Production order
 * ----------------
 * A total order on tokens:
 *   1. Compare `baseNumber`.
 *   2. Element-wise on `prefixes`. A SHORTER prefix array is LATER
 *      (longer prefix = deeper level = comes earlier in the doc).
 *      At each position, compare `value`, then case (lower < upper).
 *   3. Element-wise on `suffixes`. A SHORTER suffix array is EARLIER
 *      (longer suffix = deeper sub-scene, comes after the parent).
 *      At each position, compare `value`, then case (lower < upper).
 *
 * Together these give:  1 < 1aA < 1A < 1AA < 1AB < 1B < 2.
 */

import type { ProjectRepository } from "../project/project-repository";

// --------------------------------------------------------------------------
//                                TYPES
// --------------------------------------------------------------------------

export type SceneLevel = { value: number; lower: boolean };

export type SceneToken = {
    baseNumber: number;
    prefixes: SceneLevel[];
    suffixes: SceneLevel[];
};

/** Minimal shape needed by `computeSceneLabels`. Persistent scenes match it. */
export type LockReadable = {
    token?: SceneToken;
    omitted?: boolean;
};

export type SceneLabelStatus = "locked" | "provisional" | "omitted";

export type SceneLabel = {
    uuid: string;
    /** Structural representation. Stable across style toggles when locked. */
    token: SceneToken;
    /** Display string, derived from `token`. */
    label: string;
    status: SceneLabelStatus;
};

export type SceneNumberingStyle = "suffix" | "prefix";

const FULL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Build the effective alphabet by removing any letters the user wants to
 * skip (e.g. "I" and "O" are commonly skipped because they're confused with
 * digits). Always returns at least 2 letters so the labeling math doesn't
 * degenerate — pathological skip lists fall back to the full alphabet.
 */
export const buildSceneAlphabet = (skipped: readonly string[] = []): string => {
    const skipSet = new Set(skipped.map((s) => s.toUpperCase()));
    const filtered = FULL_ALPHABET.split("").filter((c) => !skipSet.has(c)).join("");
    return filtered.length >= 2 ? filtered : FULL_ALPHABET;
};

// --------------------------------------------------------------------------
//                          ENCODING & DISPLAY
// --------------------------------------------------------------------------

/**
 * Excel-style alphabetic letter over a configurable alphabet:
 *   1 → alphabet[0], alphabet.length → last letter, alphabet.length+1 → "AA", …
 * The alphabet defaults to A–Z but callers can pass a filtered one (e.g.
 * with "I" and "O" removed).
 */
const letterFromValue = (n: number, lower: boolean, alphabet: string = FULL_ALPHABET): string => {
    const base = alphabet.length;
    let out = "";
    while (n > 0) {
        const m = (n - 1) % base;
        const ch = alphabet[m];
        out = (lower ? ch.toLowerCase() : ch) + out;
        n = Math.floor((n - 1) / base);
    }
    return out;
};

/**
 * Render a token to its display string. Style-independent — the case of
 * each level is taken directly from `level.lower`, so the result is the
 * same regardless of the project's `SceneNumberingStyle` setting.
 */
export const compileSceneLabel = (token: SceneToken, alphabet: string = FULL_ALPHABET): string => {
    // Prefixes are stored inner-first (closest to base at index 0). Render
    // outer-to-inner, i.e. reverse before joining.
    let out = "";
    for (let i = token.prefixes.length - 1; i >= 0; i--) {
        const lvl = token.prefixes[i];
        out += letterFromValue(lvl.value, lvl.lower, alphabet);
    }
    out += String(token.baseNumber);
    for (let i = 0; i < token.suffixes.length; i++) {
        const lvl = token.suffixes[i];
        out += letterFromValue(lvl.value, lvl.lower, alphabet);
    }
    return out;
};

/** Total order on `SceneToken`. See file header for the rules. */
export const compareTokens = (a: SceneToken, b: SceneToken): number => {
    if (a.baseNumber !== b.baseNumber) return a.baseNumber - b.baseNumber;

    const pLen = Math.max(a.prefixes.length, b.prefixes.length);
    for (let i = 0; i < pLen; i++) {
        const ai = a.prefixes[i] as SceneLevel | undefined;
        const bi = b.prefixes[i] as SceneLevel | undefined;
        // For prefixes: longer = earlier ⇒ missing > defined.
        if (ai === undefined) return 1;
        if (bi === undefined) return -1;
        if (ai.value !== bi.value) return ai.value - bi.value;
        if (ai.lower !== bi.lower) return ai.lower ? -1 : 1;
    }

    const sLen = Math.max(a.suffixes.length, b.suffixes.length);
    for (let i = 0; i < sLen; i++) {
        const ai = a.suffixes[i] as SceneLevel | undefined;
        const bi = b.suffixes[i] as SceneLevel | undefined;
        // For suffixes: longer = later ⇒ missing < defined.
        if (ai === undefined) return -1;
        if (bi === undefined) return 1;
        if (ai.value !== bi.value) return ai.value - bi.value;
        if (ai.lower !== bi.lower) return ai.lower ? -1 : 1;
    }

    return 0;
};

// Convenience constructors.
const sceneLevel = (value: number, lower: boolean): SceneLevel => ({ value, lower });

/** Token for a bare integer scene number ("1", "2", …). */
export const baseToken = (baseNumber: number): SceneToken => ({
    baseNumber,
    prefixes: [],
    suffixes: [],
});

const levelEq = (a: SceneLevel, b: SceneLevel): boolean =>
    a.value === b.value && a.lower === b.lower;

// --------------------------------------------------------------------------
//                  PROVISIONAL TOKEN COMPUTATION
// --------------------------------------------------------------------------
//
// Each provisional scene gets a token derived from its immediate locked
// neighbours and its 1-based position within the segment (`k`). The rules
// preserve the existing user-visible behaviour:
//
//   suffix mode, between locked 1 and 2:                    1A,  1B,  1C, …
//   suffix mode, between locked 1A and 1B (1 also locked):  1AA, 1AB, 1AC
//   suffix mode, between locked 1 and 1A:                   1aA, 1aB, 1aC
//   prefix mode, between locked 1 and 2:                     A2,  B2,  C2
//   prefix mode, before locked 1:                            A1,  B1,  C1
//   prefix mode, between locked 1 and A2:                   AA2, BA2, CA2
//
// Both modes are duals of one another and share the same three operations
// applied along a single "axis" (suffix or prefix):
//
//   1. CONTINUE: bump the deepest level of an anchor along the axis.
//   2. NEST:    append a new uppercase level to an anchor along the axis.
//   3. WEDGE:   walk the OTHER token's path along the axis looking for a
//               point where a lowercase wedge level slots strictly between
//               the two anchors.
//
// SUFFIX mode anchors on `prev` and grows rightward toward `next`; PREFIX
// mode anchors on `next` and grows leftward toward `prev`. Each candidate
// is verified strictly-between by `compareTokens` before being returned —
// if the chosen style's strategies all fall outside the range (as can
// happen with cross-axis anchors, e.g. prefix-mode insertion between plain
// "1" and suffix-bearing "1A"), we fall back to the dual style.

type Axis = "suffix" | "prefix";

const levelsOf = (t: SceneToken, axis: Axis): SceneLevel[] =>
    axis === "suffix" ? t.suffixes : t.prefixes;

const withLevels = (t: SceneToken, axis: Axis, levels: SceneLevel[]): SceneToken =>
    axis === "suffix"
        ? { baseNumber: t.baseNumber, prefixes: t.prefixes, suffixes: levels }
        : { baseNumber: t.baseNumber, prefixes: levels, suffixes: t.suffixes };

// Wedge convention per axis. lowercase < uppercase at the same value (see
// `compareTokens`). Suffix levels count UP, so 'a' (value 1) is the deepest
// wedge — decrementing past it means descending a level. Prefix levels are
// mirrored: the alphabet's last letter (value = alphabet.length) is the
// bound; incrementing past it descends.
const wedgeBound = (axis: Axis, alphabetSize: number): number =>
    axis === "suffix" ? 1 : alphabetSize;
const wedgeStep = (axis: Axis): number => (axis === "suffix" ? -1 : 1);

/** Bump the deepest level of `anchor` along `axis` by k. */
const continueAlong = (anchor: SceneToken, k: number, axis: Axis): SceneToken | null => {
    const path = levelsOf(anchor, axis);
    if (path.length === 0) {
        // Suffix axis can fall through to bumping the base. Prefix axis
        // has nothing to continue when there's no outermost prefix.
        if (axis === "suffix") {
            return { baseNumber: anchor.baseNumber + k, prefixes: anchor.prefixes, suffixes: [] };
        }
        return null;
    }
    const last = path[path.length - 1];
    const newPath = path.slice(0, -1).concat([sceneLevel(last.value + k, last.lower)]);
    return withLevels(anchor, axis, newPath);
};

/** Append a fresh uppercase level (value k) to anchor's path along axis. */
const nestAlong = (anchor: SceneToken, k: number, axis: Axis): SceneToken =>
    withLevels(anchor, axis, [...levelsOf(anchor, axis), sceneLevel(k, false)]);

/**
 * Walk `target`'s path (skipping any shared prefix with `from`) and slot in
 * a lowercase wedge level just before its first divergent uppercase level.
 * Returns a token whose label sorts strictly between `from` and `target`,
 * or null if `target`'s path doesn't extend past the shared prefix (caller
 * needs a different strategy).
 *
 *   suffix axis: `from` = prev, `target` = next. Wedge bound is 'a'.
 *   prefix axis: `from` = next, `target` = prev. Wedge bound is 'z'.
 */
const wedgeAlong = (
    from: SceneToken,
    target: SceneToken,
    k: number,
    axis: Axis,
    alphabetSize: number,
): SceneToken | null => {
    const fromLevels = levelsOf(from, axis);
    const targetLevels = levelsOf(target, axis);
    const bound = wedgeBound(axis, alphabetSize);
    const step = wedgeStep(axis);

    let i = 0;
    while (
        i < fromLevels.length &&
        i < targetLevels.length &&
        levelEq(fromLevels[i], targetLevels[i])
    ) {
        i++;
    }

    if (i >= targetLevels.length) return null;

    const levels = targetLevels.slice(0, i);
    while (i < targetLevels.length) {
        const div = targetLevels[i];
        if (div.lower && div.value === bound) {
            // Already a wedge at this level — descend one deeper.
            levels.push(div);
            i++;
            continue;
        }
        // We can wedge here. Decrement an existing lowercase level (e.g.
        // suffix 'b' → 'a') or convert an uppercase to its lowercase
        // wedge equivalent ('A' → 'a').
        const wedgeValue = div.lower ? div.value + step : div.value;
        levels.push(sceneLevel(wedgeValue, true));
        return withLevels(target, axis, [...levels, sceneLevel(k, false)]);
    }

    // All of target's diverging levels were already at the wedge bound —
    // append one more wedge level to land strictly below them.
    levels.push(sceneLevel(bound, true));
    return withLevels(target, axis, [...levels, sceneLevel(k, false)]);
};

const isStrictlyBetween = (
    prev: SceneToken | null,
    next: SceneToken | null,
    cand: SceneToken,
): boolean => {
    if (prev && compareTokens(prev, cand) >= 0) return false;
    if (next && compareTokens(cand, next) >= 0) return false;
    return true;
};

const computeProvisionalToken = (
    prev: SceneToken | null,
    next: SceneToken | null,
    k: number,
    style: SceneNumberingStyle,
    alphabetSize: number,
): SceneToken => {
    if (!prev && !next) return baseToken(k);

    const pick = (cands: Array<SceneToken | null>): SceneToken | null => {
        for (const c of cands) if (c && isStrictlyBetween(prev, next, c)) return c;
        return null;
    };

    // Suffix-style candidates grow rightward from prev.
    const suffixCandidates = (): Array<SceneToken | null> => {
        if (prev) {
            return [
                continueAlong(prev, k, "suffix"),
                nestAlong(prev, k, "suffix"),
                next ? wedgeAlong(prev, next, k, "suffix", alphabetSize) : null,
            ];
        }
        // No prev — nothing to grow from on the suffix axis. The natural
        // dual is to nest leftward into next.
        return next ? [nestAlong(next, k, "prefix")] : [];
    };

    // Prefix-style candidates grow leftward from next.
    const prefixCandidates = (): Array<SceneToken | null> => {
        if (next) {
            return [
                prev ? continueAlong(prev, k, "prefix") : null,
                nestAlong(next, k, "prefix"),
                prev ? wedgeAlong(next, prev, k, "prefix", alphabetSize) : null,
            ];
        }
        return prev ? [continueAlong(prev, k, "suffix")] : [];
    };

    const primary = style === "suffix" ? pick(suffixCandidates()) : pick(prefixCandidates());
    if (primary) return primary;

    // Cross-style fallback: anchors don't line up along the requested
    // axis (e.g. prefix mode trying to fit something between bases 1 and
    // 1A — there's no valid prefix-only token there).
    const fallback = style === "suffix" ? pick(prefixCandidates()) : pick(suffixCandidates());
    if (fallback) return fallback;

    // Pathological input (prev >= next). Should never happen for a valid
    // scene sequence, but emit a deterministic token rather than throwing.
    if (prev) return nestAlong(prev, k, "suffix");
    if (next) return nestAlong(next, k, "prefix");
    return baseToken(k);
};

// --------------------------------------------------------------------------
//                              MAIN API
// --------------------------------------------------------------------------

/**
 * Compute display labels (and structural tokens) for an ordered list of
 * scene UUIDs. Locked scenes get their persisted token; provisional ones
 * get a token computed from their segment's immediate neighbours.
 *
 * O(N) — two linear passes precompute prev/next/segment-index, one final
 * pass emits the result.
 */
export const computeSceneLabels = (
    sceneUuids: string[],
    persistent: Record<string, LockReadable | undefined>,
    style: SceneNumberingStyle = "suffix",
    skippedLetters: readonly string[] = [],
): SceneLabel[] => {
    const alphabet = buildSceneAlphabet(skippedLetters);
    const alphabetSize = alphabet.length;
    const n = sceneUuids.length;
    const result: SceneLabel[] = new Array(n);

    const prevLocked: (SceneToken | null)[] = new Array(n);
    const nextLocked: (SceneToken | null)[] = new Array(n);
    const segmentIdx: number[] = new Array(n);

    let lastToken: SceneToken | null = null;
    let runCount = 0;
    for (let i = 0; i < n; i++) {
        const entry = persistent[sceneUuids[i]];
        if (entry?.token) {
            prevLocked[i] = lastToken;
            segmentIdx[i] = 0;
            lastToken = entry.token;
            runCount = 0;
        } else {
            prevLocked[i] = lastToken;
            runCount++;
            segmentIdx[i] = runCount;
        }
    }

    let upcomingToken: SceneToken | null = null;
    for (let i = n - 1; i >= 0; i--) {
        const entry = persistent[sceneUuids[i]];
        if (entry?.token) {
            nextLocked[i] = upcomingToken;
            upcomingToken = entry.token;
        } else {
            nextLocked[i] = upcomingToken;
        }
    }

    for (let i = 0; i < n; i++) {
        const uuid = sceneUuids[i];
        const entry = persistent[uuid];

        if (entry?.token) {
            result[i] = {
                uuid,
                token: entry.token,
                label: compileSceneLabel(entry.token, alphabet),
                status: entry.omitted ? "omitted" : "locked",
            };
            continue;
        }

        const token = computeProvisionalToken(
            prevLocked[i],
            nextLocked[i],
            segmentIdx[i],
            style,
            alphabetSize,
        );
        result[i] = {
            uuid,
            token,
            label: compileSceneLabel(token, alphabet),
            status: "provisional",
        };
    }

    return result;
};

// --------------------------------------------------------------------------
//                              ACTIONS
// --------------------------------------------------------------------------

/**
 * Mark a scene as OMITTED. The scene's heading text and body content are
 * preserved in the document; the editor overlays "OMITTED" and hides the
 * underlying content via decorations so the original screenplay survives an
 * unomit. Works regardless of production lock state.
 */
export const omitSceneByUuid = (repository: ProjectRepository, uuid: string): void => {
    repository.upsertScene(uuid, { omitted: true });
};

/** Clear an OMITTED scene's `omitted` flag, restoring the heading + body. */
export const unomitSceneByUuid = (repository: ProjectRepository, uuid: string): void => {
    const scene = repository.getScene(uuid);
    if (!scene?.omitted) return;
    repository.upsertScene(uuid, { omitted: undefined });
};
