import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ProjectData } from "@src/lib/project/project-state";
import { titlePageLine, toTitlePageAlign } from "@src/lib/titlepage/titlepage-content";
import type { JSONContent } from "@tiptap/core";
import * as fflate from "fflate";

// ─── WriterSolo / WriterDuet (.wdz) ──────────────────────────────────────────────
//
// A `.wdz` file is a ZIP archive whose single entry, `script.json`, is a
// Firebase-style operation log (not a static document). The screenplay is
// reconstructed by replaying that log:
//
//   { "b": {                          // branches
//       "-":         { "h": { ... } },  // the main writing branch
//       "titlePage": { "h": { ... } },  // the title page branch
//       ...
//   } }
//
// Each branch's `h` is an ordered map of operations keyed by Firebase push IDs:
//
//   { "a": "s", "l": "",   "v": "<json>" }   snapshot: replace the whole subtree
//   { "a": "u", "l": "data", "v": "<json>" } update: shallow-merge children (each
//                                            key under `v` is one line, replacing
//                                            that line but keeping the others)
//   {            "l": "data/<id>/type", "v": "\"Action\"" }  leaf set
//
// Replaying yields a `data` map of line-id → line. Sorting the ids lexicographically
// gives reading order (WriterDuet ids are fractional-index strings). Each line has:
//   · type           — WriterDuet line type (Slugline, Action, EditDialogName, …)
//   · content / `.c` — text as OT change-sets { changeId: [base, ops, timestamp] }.
//                      `content` is the text as first written, `.c` the later edits;
//                      a line may carry either or both, so both are composed (oldest
//                      first). Each op is ["i"|"d", [client, context, pos, payload]]
//                      where payload is the inserted text ("i") or deleted length ("d").
//   · pb             — 1 for a manual page break before the line.
// Inline formatting is carried inline by paired control characters in the text:
//   \x01…\x02 bold, \x03…\x04 italic, \x05…\x06 underline.

const DOCUMENT_ENTRY = "script.json";
const MAIN_BRANCH = "-";
const TITLE_BRANCH = "titlePage";

// WriterDuet line type → Scriptio node type. Unknown types fall back to "action".
const LINE_TYPE_TABLE: Record<string, string> = {
    Slugline: "scene",
    Action: "action",
    Character: "character",
    EditDialogName: "character",
    Dialogue: "dialogue",
    EditDialogContent: "dialogue",
    Parenthetical: "parenthetical",
    EditDialogParen: "parenthetical",
    Transition: "transition",
    Note: "note",
    Text: "action",
    Shot: "action",
    Image: "action",
    Act: "section",
    EndAct: "section",
    Outline: "section",
    Sequence: "section",
};

type MarkType = "bold" | "italic" | "underline";

// Control characters that open / close an inline style run.
const MARK_OPENERS: Record<number, MarkType> = { 1: "bold", 3: "italic", 5: "underline" };
const MARK_CLOSERS: Record<number, MarkType> = { 2: "bold", 4: "italic", 6: "underline" };
const MARK_ORDER: MarkType[] = ["bold", "italic", "underline"];

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Operation-log replay ─────────────────────────────────────────────────────────

/** Return (creating if needed) the nested object at `segs` under `root`. */
function getPath(root: Record<string, unknown>, segs: string[]): Record<string, unknown> {
    let cur = root;
    for (const seg of segs) {
        const child = cur[seg];
        if (isObject(child)) {
            cur = child;
        } else {
            const fresh: Record<string, unknown> = {};
            cur[seg] = fresh;
            cur = fresh;
        }
    }
    return cur;
}

/** Set (or delete, when `value` is null) the leaf at `segs` under `root`. */
function setPath(root: Record<string, unknown>, segs: string[], value: unknown): void {
    const parent = getPath(root, segs.slice(0, -1));
    const last = segs[segs.length - 1];
    if (value === null) delete parent[last];
    else parent[last] = value;
}

/** Replay a branch's operation log into its resolved state object. */
function replayBranch(branch: unknown): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    if (!isObject(branch) || !isObject(branch.h)) return state;

    for (const key of Object.keys(branch.h)) {
        const op = branch.h[key];
        if (!isObject(op)) continue;

        let value: unknown;
        try {
            value = typeof op.v === "string" ? JSON.parse(op.v) : op.v;
        } catch {
            value = op.v;
        }

        const path = typeof op.l === "string" ? op.l.replace(/\/+$/, "") : "";
        const segs = path ? path.split("/") : [];

        if (op.a === "s") {
            // Snapshot: replace the subtree (the root, for the initial snapshot).
            if (segs.length === 0) {
                for (const k of Object.keys(state)) delete state[k];
                if (isObject(value)) Object.assign(state, value);
            } else {
                setPath(state, segs, value);
            }
        } else if (op.a === "u") {
            // Update: shallow-merge each child of `value` into the path (Firebase
            // `update()` semantics — replace listed children, keep the rest).
            const target = getPath(state, segs);
            if (isObject(value)) {
                for (const childKey of Object.keys(value)) {
                    const childVal = value[childKey];
                    if (childVal === null) delete target[childKey];
                    else target[childKey] = childVal;
                }
            }
        } else if (segs.length) {
            // Plain leaf set.
            setPath(state, segs, value);
        }
    }

    return state;
}

// ── Line → screenplay node ─────────────────────────────────────────────────────────

/** Compose a line's OT change-sets into its final plain text (with style markers). */
function lineText(line: Record<string, unknown>): string {
    // Text lives in OT change-sets under `content` and/or `.c`. A line edited
    // since creation carries both: `content` holds the text as first written,
    // `.c` the later edits (and a line created granularly, like the very first
    // one, may have only `.c`). Compose every change-set in timestamp order.
    const changes: unknown[][] = [];
    for (const field of [line.content, line[".c"]]) {
        if (!isObject(field)) continue;
        for (const change of Object.values(field)) {
            if (Array.isArray(change)) changes.push(change);
        }
    }
    // Each change-set is [base, ops, timestamp]; apply oldest first.
    changes.sort((a, b) => (Number(a[2]) || 0) - (Number(b[2]) || 0));

    let text = "";
    for (const change of changes) {
        const ops = change[1];
        if (!Array.isArray(ops)) continue;

        for (const op of ops) {
            // op is ["i"|"d", [client, context, pos, payload]] — payload is the
            // inserted string for "i", or the deleted length for "d".
            if (!Array.isArray(op) || !Array.isArray(op[1])) continue;
            const args = op[1];
            const pos = Number(args[2]) || 0;
            if (op[0] === "i") {
                const inserted = typeof args[3] === "string" ? args[3] : "";
                text = text.slice(0, pos) + inserted + text.slice(pos);
            } else if (op[0] === "d") {
                const len = Number(args[3]) || 0;
                text = text.slice(0, pos) + text.slice(pos + len);
            }
        }
    }
    return text;
}

/** Split style-marker-delimited text into TipTap text nodes carrying marks. */
function parseRuns(text: string): JSONContent[] {
    const runs: JSONContent[] = [];
    const active: Record<MarkType, boolean> = { bold: false, italic: false, underline: false };
    let buffer = "";

    const flush = () => {
        if (!buffer) return;
        const marks = MARK_ORDER.filter((m) => active[m]).map((type) => ({ type }));
        const node: JSONContent = { type: "text", text: buffer };
        if (marks.length > 0) node.marks = marks;
        runs.push(node);
        buffer = "";
    };

    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        if (code in MARK_OPENERS) {
            flush();
            active[MARK_OPENERS[code]] = true;
        } else if (code in MARK_CLOSERS) {
            flush();
            active[MARK_CLOSERS[code]] = false;
        } else {
            buffer += ch;
        }
    }
    flush();
    return runs;
}

/** A screenplay block node for the main document. */
function screenplayLineToNode(line: Record<string, unknown>): JSONContent {
    const rawType = typeof line.type === "string" ? line.type : "";
    const type = LINE_TYPE_TABLE[rawType] ?? "action";

    const attrs: Record<string, unknown> = { class: type };
    if (line.pb) attrs.pageBreak = true;

    return { type, attrs, content: parseRuns(lineText(line)) };
}

/** A title-page block node (`tp-text`), carrying the WriterDuet line's alignment. */
function titlePageLineToNode(line: Record<string, unknown>): JSONContent {
    return titlePageLine(parseRuns(lineText(line)), toTitlePageAlign(line.al));
}

/** Replay a branch and convert its lines (in reading order) with `toNode`. */
function branchToNodes(branch: unknown, toNode: (line: Record<string, unknown>) => JSONContent): JSONContent[] {
    const data = replayBranch(branch).data;
    if (!isObject(data)) return [];

    const nodes: JSONContent[] = [];
    for (const id of Object.keys(data).sort()) {
        const line = data[id];
        if (!isObject(line)) continue;
        if (line.removed || line.deleted) continue;
        // Skip metadata-only ghost entries (formatting holders without a line type).
        if (typeof line.type !== "string") continue;
        nodes.push(toNode(line));
    }
    return nodes;
}

/** Pick the screenplay branch: the conventional `-`, else the first live, non-title one. */
function selectScreenplayBranch(branches: Record<string, unknown>): unknown {
    if (branches[MAIN_BRANCH] !== undefined) return branches[MAIN_BRANCH];

    for (const [key, branch] of Object.entries(branches)) {
        if (key === TITLE_BRANCH || !isObject(branch)) continue;
        const details = branch.details;
        if (isObject(details) && details.is_live && details.branchType !== "empty" && !details.removed) {
            return branch;
        }
    }
    return undefined;
}

export class WriterSoloAdapter extends ProjectAdapter<BaseExportOptions> {
    label = "WriterSolo";
    // Import-only: `convertTo` below rejects, so the export UI never offers it.
    exportTarget = null;
    importExtensions = ["wdz"];

    convertTo(): Promise<Blob> {
        return Promise.reject(new Error("Export to WriterSolo is not supported"));
    }

    convertFrom(rawContent: ArrayBuffer): Partial<ProjectData> {
        const unzipped = fflate.unzipSync(new Uint8Array(rawContent), {
            filter: (f) => f.name === DOCUMENT_ENTRY,
        });

        const bytes = unzipped[DOCUMENT_ENTRY];
        if (!bytes) {
            throw new Error("Invalid WriterSolo file: missing script.json");
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(fflate.strFromU8(bytes));
        } catch {
            throw new Error("Invalid WriterSolo file: script.json is not valid JSON");
        }

        const branches = isObject(parsed) ? parsed.b : undefined;
        if (!isObject(branches)) {
            throw new Error("Invalid WriterSolo file: no script branches found");
        }

        const screenplay = branchToNodes(selectScreenplayBranch(branches), screenplayLineToNode);
        const titlepage = branchToNodes(branches[TITLE_BRANCH], titlePageLineToNode);

        return { screenplay, titlepage };
    }
}
