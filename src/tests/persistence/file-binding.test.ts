import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ProjectState } from "@src/lib/project/project-state";
import { createProjectRepository } from "@src/lib/project/project-repository";
import {
    openProjectFile,
    rangeReaderFor,
    readDocumentUpdate,
} from "@src/lib/persistence/project-file/reader";
import { materialise, planRewrite } from "@src/lib/persistence/project-file/writer";
import { DATA_START } from "@src/lib/persistence/project-file/format";
import {
    createCachedProject,
    deleteCachedProject,
    clearYjsData,
    getCachedProject,
} from "@src/lib/persistence/storage-provider/local-persistence";
import { createLocalYjsProvider, writeYjsDocumentLocally } from "@src/lib/persistence/y-local-provider";
import { pendingProjectUpdate, recordProjectUpdate, releaseProjectLog } from "@src/lib/persistence/update-log";

/**
 * An in-memory filesystem standing in for the Tauri plugin.
 *
 * `vi.hoisted` because the mock factories below are hoisted above every other
 * statement in the module, so they cannot close over an ordinary `const`.
 */
const disk = vi.hoisted(() => {
    const files = new Map<string, { bytes: Uint8Array; mtimeMs: number }>();
    // A path the sandbox refuses, to stand in for a binding whose scope grant
    // is gone. The plugin reports this as a plain "forbidden path" message.
    let denied: string | null = null;
    // Monotonic stand-in for filesystem timestamps: real ones can be coarser
    // than a test's write loop, and the writer's whole job here is to notice
    // that a file changed.
    let clock = 1_000;
    /** Writes that actually landed on a target path (not the scratch file). */
    let commits = 0;
    // One-shot hooks for interleaving something into a write that is already
    // under way — the only way to reproduce a race from the outside, since a
    // write is one `await` to its caller.
    let onNextStat: (() => Promise<void> | void) | null = null;
    let onNextWrite: (() => Promise<void> | void) | null = null;

    return {
        files,
        reset() {
            files.clear();
            commits = 0;
            denied = null;
            onNextStat = null;
            onNextWrite = null;
        },
        /** Run `fn` after the next `stat` has read the file, before it returns. */
        duringNextStat(fn: () => Promise<void> | void) {
            onNextStat = fn;
        },
        /** Run `fn` while the next write is in flight, before its bytes land. */
        duringNextWrite(fn: () => Promise<void> | void) {
            onNextWrite = fn;
        },
        async takeStatHook() {
            const fn = onNextStat;
            onNextStat = null;
            if (fn) await fn();
        },
        async takeWriteHook() {
            const fn = onNextWrite;
            onNextWrite = null;
            if (fn) await fn();
        },
        denyAccessTo(path: string | null) {
            denied = path;
        },
        assertAllowed(path: string) {
            if (denied !== null && path === denied) {
                throw new Error(
                    `forbidden path: ${path}, maybe it is not allowed on the scope for \`allow-exists\` permission`,
                );
            }
        },
        commits: () => commits,
        put(path: string, bytes: Uint8Array) {
            clock += 1000;
            files.set(path, { bytes, mtimeMs: clock });
        },
        get: (path: string) => files.get(path),
        commit(path: string, bytes: Uint8Array) {
            clock += 1000;
            files.set(path, { bytes, mtimeMs: clock });
            commits += 1;
        },
    };
});

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: () => true,
    invoke: async (
        cmd: string,
        payload?: unknown,
        options?: { headers?: Record<string, string> },
    ) => {
        const args = (payload ?? {}) as Record<string, unknown>;
        // Stands in for the Rust command that grants the scratch sibling: the
        // file dialog only scopes the exact path it returned, so the writer has
        // to ask for the `.part` file by name before it can create it.
        if (cmd === "allow_scratch_file") return `${args.path as string}.part`;

        // The incremental writer's two commands, over the same in-memory disk.
        // Both commands speak raw binary: the read returns an ArrayBuffer and the
        // write takes the bytes *as* the payload, with its scalars in headers.
        // Modelled exactly, so a caller that reverts to a JSON args object fails
        // here rather than silently shipping megabytes of numbers per save.
        if (cmd === "read_file_range") {
            const file = disk.get(args.path as string);
            if (!file) throw new Error(`ENOENT: ${args.path as string}`);
            const offset = args.offset as number;
            const slice = file.bytes.slice(offset, offset + (args.len as number));
            return slice.buffer.slice(
                slice.byteOffset,
                slice.byteOffset + slice.byteLength,
            ) as ArrayBuffer;
        }
        if (cmd === "write_file_at") {
            const headers = options?.headers ?? {};
            const path = decodeURIComponent(headers["x-path"]);
            const existing = disk.get(path)?.bytes ?? new Uint8Array(0);
            const offset = Number(headers["x-offset"]);
            const bytes = payload as Uint8Array;
            const truncate = headers["x-truncate"] === "1";

            // Seek, write, and only then truncate — exactly what the Rust side
            // does, so a plan that miscounts an offset shows up here as a
            // corrupt file rather than as a silently forgiving splice.
            const length = truncate
                ? offset + bytes.length
                : Math.max(existing.length, offset + bytes.length);
            const next = new Uint8Array(length);
            next.set(existing.subarray(0, Math.min(existing.length, length)));
            next.set(bytes, offset);
            disk.commit(path, next);
            return null;
        }
        return [];
    },
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    exists: async (path: string) => {
        disk.assertAllowed(path);
        return disk.files.has(path);
    },
    stat: async (path: string) => {
        const file = disk.get(path);
        if (!file) throw new Error(`ENOENT: ${path}`);
        const info = {
            isFile: true,
            isDirectory: false,
            isSymlink: false,
            size: file.bytes.byteLength,
            mtime: new Date(file.mtimeMs),
            atime: null,
            birthtime: null,
            readonly: false,
        };
        // After the reading, before the returning: the caller gets the state the
        // file was in when it asked, and anything the hook does lands "between"
        // this check and whatever the caller does next.
        await disk.takeStatHook();
        return info;
    },
    readFile: async (path: string) => {
        const file = disk.get(path);
        if (!file) throw new Error(`ENOENT: ${path}`);
        return file.bytes;
    },
    writeFile: async (path: string, bytes: Uint8Array) => {
        await disk.takeWriteHook();
        // The scratch file is staging; only the rename counts as a save.
        if (path.endsWith(".part")) disk.put(path, bytes);
        else disk.commit(path, bytes);
    },
    rename: async (from: string, to: string) => {
        const file = disk.get(from);
        if (!file) throw new Error(`ENOENT: ${from}`);
        disk.files.delete(from);
        disk.commit(to, file.bytes);
    },
    remove: async (path: string) => {
        disk.files.delete(path);
    },
}));

const PATH = "/Users/test/Screenplays/project.scriptio";

/** The document a bound file holds, read the way the app reads it. */
async function docOnDisk(bytes: Uint8Array): Promise<ProjectState> {
    const read = rangeReaderFor(bytes);
    const file = await openProjectFile(read, bytes.length);
    const update = await readDocumentUpdate(read, file);

    const doc = new ProjectState();
    if (update) Y.applyUpdate(doc, update);
    return doc;
}

function appendLine(doc: ProjectState, id: string, text: string): void {
    const element = new Y.XmlElement("action");
    element.setAttribute("data-id", id);
    element.setAttribute("class", "action");
    element.insert(0, [new Y.XmlText(text)]);
    const fragment = doc.screenplayFragment();
    doc.transact(() => fragment.insert(fragment.length, [element]));
}

function textOf(doc: ProjectState): string[] {
    const out: string[] = [];
    doc.screenplayFragment().forEach((node) => out.push(node.toString()));
    return out;
}

function newDoc(title: string, line: string): ProjectState {
    const doc = new ProjectState();
    const repo = createProjectRepository(doc)!;
    doc.transact(() => {
        repo.setTitle(title);
        doc.metadata().set("version", 1);
    });
    repo.ensureLineageId();
    appendLine(doc, "a1", line);
    return doc;
}

/** A bound file holding `doc`, as another program (or machine) would leave it. */
async function exportBinary(doc: ProjectState): Promise<Uint8Array> {
    return materialise(planRewrite([], Y.encodeStateAsUpdate(doc)));
}

/** Open a project's local Yjs document, run `fn`, and let the write settle. */
async function withStoredDoc<T>(projectId: string, fn: (doc: ProjectState) => T): Promise<T> {
    const doc = new ProjectState();
    const provider = await createLocalYjsProvider(projectId, doc);
    try {
        await new Promise<void>((resolve) => provider.on("synced", () => resolve()));
        return fn(doc);
    } finally {
        await new Promise((resolve) => setTimeout(resolve, 100));
        provider.destroy();
        doc.destroy();
    }
}

/**
 * Edit the stored document *and* feed the update log, which is what the editor
 * session's `update` observer does on every keystroke. `withStoredDoc` alone
 * models an edit the log never saw — a project with no session open — and the
 * two are deliberately different here.
 */
async function withLoggedDoc<T>(projectId: string, fn: (doc: ProjectState) => T): Promise<T> {
    return withStoredDoc(projectId, (doc) => {
        const forward = (update: Uint8Array) => recordProjectUpdate(projectId, update);
        doc.on("update", forward);
        try {
            return fn(doc);
        } finally {
            doc.off("update", forward);
        }
    });
}

let projectId: string;
let binding: typeof import("@src/lib/persistence/file-binding");

beforeEach(async () => {
    disk.reset();
    binding = await import("@src/lib/persistence/file-binding");

    const project = await createCachedProject("Bound project");
    projectId = project.id;

    const doc = newDoc("Bound project", "One");
    await writeYjsDocumentLocally(projectId, doc);
    doc.destroy();
});

afterEach(async () => {
    binding.releaseFileBinding(projectId);
    await deleteCachedProject(projectId);
    await clearYjsData(projectId);
});

describe("file binding writer", () => {
    it("writes the project on binding, atomically", async () => {
        await binding.bindProject(projectId, PATH);

        expect(disk.commits()).toBe(1);
        // Temp-and-rename: the scratch file must not be left behind.
        expect(disk.get(`${PATH}.part`)).toBeUndefined();

        const written = await docOnDisk(disk.get(PATH)!.bytes);
        expect(textOf(written).join()).toContain("One");
        written.destroy();

        const row = await getCachedProject(projectId);
        expect(row?.filePath).toBe(PATH);
        expect(row?.fileLastWriteSv).toBeTruthy();
    });

    it("skips a redundant write when the state vector has not moved (R7)", async () => {
        await binding.bindProject(projectId, PATH);
        expect(disk.commits()).toBe(1);

        // Nothing changed: re-emitting the whole archive would be pure cost.
        await binding.flushNow(projectId);
        expect(disk.commits()).toBe(1);

        // A real edit moves the vector, and the next flush writes.
        await withStoredDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));
        await binding.flushNow(projectId);
        expect(disk.commits()).toBe(2);
    });

    it("merges changes another program made to the file, instead of clobbering them (R8)", async () => {
        await binding.bindProject(projectId, PATH);

        // Somebody else — a sync client, another machine — writes a newer copy of
        // the *same* document over our file.
        const theirs = await docOnDisk(disk.get(PATH)!.bytes);
        appendLine(theirs, "x1", "Edited elsewhere");
        disk.put(PATH, await exportBinary(theirs));
        theirs.destroy();

        // Meanwhile we edit locally, so a plain rewrite would drop their line.
        await withStoredDoc(projectId, (doc) => appendLine(doc, "l1", "Edited here"));
        await binding.flushNow(projectId);

        const local = await withStoredDoc(projectId, (doc) => textOf(doc).join("\n"));
        expect(local).toContain("Edited elsewhere");
        expect(local).toContain("Edited here");

        const onDisk = await docOnDisk(disk.get(PATH)!.bytes);
        const written = textOf(onDisk).join("\n");
        expect(written).toContain("Edited elsewhere");
        expect(written).toContain("Edited here");
        onDisk.destroy();
    });

    it("rewrites a file that was replaced by an older copy of the same project", async () => {
        await binding.bindProject(projectId, PATH);
        const stale = disk.get(PATH)!.bytes;

        await withStoredDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));
        await binding.flushNow(projectId);

        // Something puts the earlier copy back — a sync client resolving a
        // conflict the wrong way, or a restored backup. Merging it in is a no-op
        // (we already have everything it holds), so the state-vector check would
        // skip the write and leave the file permanently behind.
        disk.put(PATH, stale);
        await binding.flushNow(projectId);

        const onDisk = await docOnDisk(disk.get(PATH)!.bytes);
        expect(textOf(onDisk).join("\n")).toContain("Two");
        onDisk.destroy();
    });

    it("keeps a deletion made while the archive was being built (R7)", async () => {
        await binding.bindProject(projectId, PATH);
        await withStoredDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));

        // Cut the line while the write is in flight. The archive was serialised
        // before this, so these bytes cannot contain it — and a deletion moves
        // no clock, so the state vector will not report it either. Only the
        // dirty flag can carry it to the next write.
        disk.duringNextWrite(async () => {
            await withStoredDoc(projectId, (doc) => {
                const fragment = doc.screenplayFragment();
                doc.transact(() => fragment.delete(fragment.length - 1, 1));
            });
            // What the editor's update observer does on every edit.
            binding.scheduleFileWrite(projectId);
        });
        await binding.flushNow(projectId);

        const afterFirst = await docOnDisk(disk.get(PATH)!.bytes);
        expect(textOf(afterFirst).join("\n")).toContain("Two");
        afterFirst.destroy();

        // So the next write must actually run rather than being skipped as a
        // no-op, and must take the deletion with it.
        await binding.flushNow(projectId);

        const onDisk = await docOnDisk(disk.get(PATH)!.bytes);
        expect(textOf(onDisk).join("\n")).not.toContain("Two");
        onDisk.destroy();
    });

    it("does not overwrite a file that changed while the archive was being built (R8)", async () => {
        await binding.bindProject(projectId, PATH);
        await withStoredDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));

        // Land an external write immediately after the writer has checked the
        // file and found it untouched. On a project with assets the build that
        // follows that check takes seconds, so this is the window a sync client
        // realistically writes into — and the check that would have caught it
        // has already happened.
        disk.duringNextStat(async () => {
            const theirs = await docOnDisk(disk.get(PATH)!.bytes);
            appendLine(theirs, "x1", "Edited elsewhere");
            disk.put(PATH, await exportBinary(theirs));
            theirs.destroy();
        });

        const before = disk.commits();
        await binding.flushNow(projectId);

        // The archive in hand predates their line, so it must not be swapped in.
        expect(disk.commits()).toBe(before);
        const onDisk = await docOnDisk(disk.get(PATH)!.bytes);
        expect(textOf(onDisk).join("\n")).toContain("Edited elsewhere");
        onDisk.destroy();

        // Taken in rather than merely refused, so the next write carries both.
        const local = await withStoredDoc(projectId, (doc) => textOf(doc).join("\n"));
        expect(local).toContain("Edited elsewhere");
        expect(local).toContain("Two");
    });

    it("stops writing when the file at the path belongs to a different document (R8)", async () => {
        await binding.bindProject(projectId, PATH);

        const stranger = newDoc("Someone else's script", "Not ours");
        const strangerBytes = await exportBinary(stranger);
        disk.put(PATH, strangerBytes);
        stranger.destroy();

        const before = disk.commits();
        await withStoredDoc(projectId, (doc) => appendLine(doc, "l1", "Edited here"));
        await binding.flushNow(projectId);

        // Neither written over nor merged in: only the user can say what this is.
        expect(disk.commits()).toBe(before);
        expect(disk.get(PATH)!.bytes).toEqual(strangerBytes);
        expect(binding.getFileBindingStatus(projectId)).toEqual({
            state: "error",
            path: PATH,
            message: "foreign-file",
        });

        const local = await withStoredDoc(projectId, (doc) => textOf(doc).join("\n"));
        expect(local).not.toContain("Not ours");
    });

    it("surfaces a lost permission as a recoverable problem, not silence", async () => {
        await binding.bindProject(projectId, PATH);
        binding.releaseFileBinding(projectId);

        // A binding can outlive its scope grant — the app was reinstalled, the
        // persisted scope was cleared, or the binding predates persistence. The
        // project must not come back looking simply unbound while its row still
        // names a file and its saves have quietly stopped.
        disk.denyAccessTo(PATH);
        try {
            await binding.loadFileBinding(projectId);
        } finally {
            disk.denyAccessTo(null);
        }

        expect(binding.getFileBindingStatus(projectId)).toEqual({
            state: "error",
            path: PATH,
            message: "no-access",
        });
    });

    it("reports a missing file and refuses to re-create it at a stale path", async () => {
        await binding.bindProject(projectId, PATH);
        const before = disk.commits();

        // The volume was unmounted, or the file was moved in Finder.
        disk.files.delete(PATH);
        await withStoredDoc(projectId, (doc) => appendLine(doc, "l1", "Written while gone"));
        await binding.flushNow(projectId);

        expect(disk.commits()).toBe(before);
        expect(disk.get(PATH)).toBeUndefined();
        expect(binding.getFileBindingStatus(projectId)).toEqual({ state: "missing", path: PATH });
    });

    it("picks up an existing same-lineage file when binding to it", async () => {
        // A copy of this project that has moved on lives at the path already —
        // a restored backup, or the same file synced from another machine.
        const existing = await withStoredDoc(projectId, (doc) => {
            const copy = new ProjectState();
            Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
            return copy;
        });
        appendLine(existing, "e1", "Already in the file");
        disk.put(PATH, await exportBinary(existing));
        existing.destroy();

        await binding.bindProject(projectId, PATH);

        const local = await withStoredDoc(projectId, (doc) => textOf(doc).join("\n"));
        expect(local).toContain("Already in the file");
        expect(local).toContain("One");
    });

    it("refuses a path another project already writes to", async () => {
        await binding.bindProject(projectId, PATH);

        const other = await createCachedProject("Other project");
        try {
            const doc = newDoc("Other project", "Elsewhere");
            await writeYjsDocumentLocally(other.id, doc);
            doc.destroy();

            expect(await binding.checkBindTarget(other.id, PATH)).toMatchObject({
                kind: "path-taken",
                projectId,
            });
        } finally {
            binding.releaseFileBinding(other.id);
            await deleteCachedProject(other.id);
            await clearYjsData(other.id);
        }
    });

    it("flags an existing file from a different document as a destructive replace", async () => {
        const stranger = newDoc("Someone else's script", "Not ours");
        disk.put(PATH, await exportBinary(stranger));
        stranger.destroy();

        expect(await binding.checkBindTarget(projectId, PATH)).toEqual({
            kind: "replaces-foreign-file",
        });
    });

    it("arms the update log against the archive it just wrote", async () => {
        // Before any write there is no base on disk to describe a gap from, so
        // the log must refuse to answer rather than answer emptily.
        expect(pendingProjectUpdate(projectId)).toEqual({ kind: "unavailable" });

        await binding.bindProject(projectId, PATH);

        // After one, the file holds exactly the document the log was armed
        // against — nothing to append yet, and it can say so.
        expect(pendingProjectUpdate(projectId)).toEqual({ kind: "empty" });
    });

    it("drops the log when the session goes, so a stale one cannot be reused", async () => {
        await binding.bindProject(projectId, PATH);
        expect(pendingProjectUpdate(projectId)).toEqual({ kind: "empty" });

        binding.releaseFileBinding(projectId);
        expect(pendingProjectUpdate(projectId)).toEqual({ kind: "unavailable" });
    });

    it("appends a save instead of rewriting the archive (R7)", async () => {
        await binding.bindProject(projectId, PATH);
        const afterBind = disk.get(PATH)!.bytes.slice();

        await withLoggedDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));
        await binding.flushNow(projectId);

        const after = disk.get(PATH)!.bytes;

        // The whole point, asserted directly: every byte of *data* the first
        // write left is still there, untouched, and the save went on the end. On
        // a project with gigabytes of assets those bytes are the gigabytes. Only
        // the header region changes, and only the commit slot that was not in force
        // — which is what makes an interrupted commit harmless.
        expect(after.subarray(DATA_START, afterBind.length)).toEqual(afterBind.subarray(DATA_START));

        // And it cost the edit, not the project.
        expect(after.length - afterBind.length).toBeLessThan(4096);

        // The archive still reads as the document it represents — base plus log.
        const onDisk = await docOnDisk(after);
        const text = textOf(onDisk).join("\n");
        expect(text).toContain("One");
        expect(text).toContain("Two");
        onDisk.destroy();
    });

    it("keeps appending across several saves, and stays readable", async () => {
        await binding.bindProject(projectId, PATH);
        const afterBind = disk.get(PATH)!.bytes.slice();

        for (const line of ["Two", "Three", "Four"]) {
            await withLoggedDoc(projectId, (doc) => appendLine(doc, line, line));
            await binding.flushNow(projectId);
        }

        const after = disk.get(PATH)!.bytes;
        expect(after.subarray(DATA_START, afterBind.length)).toEqual(afterBind.subarray(DATA_START));

        const onDisk = await docOnDisk(after);
        const text = textOf(onDisk).join("\n");
        for (const line of ["One", "Two", "Three", "Four"]) expect(text).toContain(line);
        onDisk.destroy();
    });

    it("rewrites the archive whole when the log cannot vouch for itself", async () => {
        await binding.bindProject(projectId, PATH);
        const afterBind = disk.get(PATH)!.bytes.slice();

        // A session that has just started has recorded nothing, so it cannot
        // know what the file is missing. Appending on that basis would write a
        // log with a hole in it.
        await withStoredDoc(projectId, (doc) => appendLine(doc, "a2", "Two"));
        releaseProjectLog(projectId);
        await binding.flushNow(projectId);

        const after = disk.get(PATH)!.bytes;
        expect(after.subarray(DATA_START, afterBind.length)).not.toEqual(afterBind.subarray(DATA_START));

        const onDisk = await docOnDisk(after);
        expect(textOf(onDisk).join("\n")).toContain("Two");
        onDisk.destroy();

        // And the rewrite leaves the log armed against what it just wrote.
        expect(pendingProjectUpdate(projectId)).toEqual({ kind: "empty" });
    });

    it("unbinds without touching the file", async () => {
        await binding.bindProject(projectId, PATH);
        const bytes = disk.get(PATH)!.bytes;

        await binding.unbindProject(projectId);

        expect(disk.get(PATH)!.bytes).toEqual(bytes);
        expect(binding.getFileBindingStatus(projectId)).toEqual({ state: "unbound" });
        expect((await getCachedProject(projectId))?.filePath).toBeUndefined();
    });
});
