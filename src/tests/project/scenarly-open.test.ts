import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";

import { ProjectState, applyProjectData, projectDataOf } from "@src/lib/project/project-state";
import { createProjectRepository } from "@src/lib/project/project-repository";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { ScenarlyAdapter } from "@src/lib/adapters/scenarly/scenarly-adapter";
import {
    applyScenarlyUpdate,
    createProjectFromScenarly,
    hasOps,
    planScenarlyOpen,
    ScenarlyMergeError,
} from "@src/lib/adapters/scenarly/scenarly-open";
import type { ProjectMigration } from "@src/lib/project/migrations/project-migrations";
import {
    createCachedProject,
    deleteCachedProject,
    clearYjsData,
} from "@src/lib/persistence/storage-provider/local-persistence";
import { createLocalYjsProvider, writeYjsDocumentLocally } from "@src/lib/persistence/y-local-provider";
import { materialise, planRewrite } from "@src/lib/persistence/project-file/writer";

// ── Helpers ───────────────────────────────────────────────────────────────────

const action = (id: string, text: string) => ({
    type: "action",
    attrs: { "data-id": id, class: "action" },
    content: [{ type: "text", text }],
});

/** Append one action paragraph to a doc's screenplay fragment. */
function appendLine(doc: ProjectState, id: string, text: string): void {
    const fragment = doc.screenplayFragment();
    const element = new Y.XmlElement("action");
    element.setAttribute("data-id", id);
    element.setAttribute("class", "action");
    element.insert(0, [new Y.XmlText(text)]);
    doc.transact(() => fragment.insert(fragment.length, [element]));
}

/** Every line of screenplay text, in order — the thing a bad merge duplicates. */
function lines(doc: ProjectState): string[] {
    return projectDataOf(doc).screenplay.map((node) =>
        (node.content ?? []).map((child) => child.text ?? "").join(""),
    );
}

/** A fresh project doc with one line and a stamped lineage. */
function newProjectDoc(title: string, firstLine: string): ProjectState {
    const doc = new ProjectState();
    const repo = createProjectRepository(doc)!;
    doc.transact(() => {
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            { type: "doc", content: [action("a1", firstLine)] },
            doc.screenplayFragment(),
        );
        repo.setTitle(title);
        doc.metadata().set("version", 1);
    });
    repo.ensureLineageId();
    return doc;
}

const adapter = new ScenarlyAdapter();

async function exportBinary(doc: ProjectState): Promise<ArrayBuffer> {
    const blob = await adapter.convertTo(doc, {
        title: doc.metadata().get("title") ?? "Untitled",
        author: "",
        includeNotes: false,
        readable: false,
    });
    return blob.arrayBuffer();
}

/**
 * The same document written as a *bound* project file rather than an archive —
 * what the user double-clicks when they open their own working copy.
 */
function boundFile(doc: ProjectState): ArrayBuffer {
    const bytes = materialise(planRewrite([], Y.encodeStateAsUpdate(doc)));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function exportReadable(doc: ProjectState): Promise<ArrayBuffer> {
    const blob = await adapter.convertTo(doc, {
        title: doc.metadata().get("title") ?? "Untitled",
        author: "",
        includeNotes: false,
        readable: true,
    });
    return blob.arrayBuffer();
}

/** A replica of `doc`, built the way a recipient's app builds one. */
function replicaOf(doc: ProjectState): ProjectState {
    const replica = new ProjectState();
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    return replica;
}

const createdProjects: string[] = [];

/** Create a cached project whose local Yjs document is `doc`. */
async function persistAsProject(doc: ProjectState, title = "Test"): Promise<string> {
    const project = await createCachedProject(title);
    createdProjects.push(project.id);
    await writeYjsDocumentLocally(project.id, doc);
    return project.id;
}

/** Read a project's local Yjs document back out of IndexedDB. */
async function readProjectDoc<T>(projectId: string, fn: (doc: ProjectState) => T): Promise<T> {
    const doc = new ProjectState();
    const provider = await createLocalYjsProvider(projectId, doc);
    try {
        await new Promise<void>((resolve) => provider.on("synced", () => resolve()));
        return fn(doc);
    } finally {
        provider.destroy();
        doc.destroy();
    }
}

afterEach(async () => {
    // Every plan scans the whole library, so leftovers make later tests slower
    // (and, if one ever shared a lineage, wrong).
    for (const id of createdProjects.splice(0)) {
        await deleteCachedProject(id);
        await clearYjsData(id);
    }
});

// ── hasOps ────────────────────────────────────────────────────────────────────

describe("hasOps", () => {
    it("is false against a peer that has everything, true once one side moves on", () => {
        const a = newProjectDoc("A", "One");
        const b = replicaOf(a);

        expect(hasOps(a, Y.encodeStateVector(b))).toBe(false);
        expect(hasOps(b, Y.encodeStateVector(a))).toBe(false);

        appendLine(a, "a2", "Two");
        expect(hasOps(a, Y.encodeStateVector(b))).toBe(true);
        expect(hasOps(b, Y.encodeStateVector(a))).toBe(false);

        a.destroy();
        b.destroy();
    });

    it("does not rely on an empty diff being zero bytes", () => {
        const doc = newProjectDoc("A", "One");
        appendLine(doc, "a2", "Two");

        // Deleting leaves a delete set that rides along in every encoding, so the
        // "no new operations" diff is emphatically not empty.
        const fragment = doc.screenplayFragment();
        doc.transact(() => fragment.delete(0, 1));

        const selfDiff = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc));
        expect(selfDiff.byteLength).toBeGreaterThan(2);
        expect(hasOps(doc, Y.encodeStateVector(doc))).toBe(false);

        doc.destroy();
    });
});

// ── Lineage ───────────────────────────────────────────────────────────────────

describe("lineage", () => {
    it("cannot be overwritten once set", () => {
        const doc = new ProjectState();
        const repo = createProjectRepository(doc)!;

        const first = repo.ensureLineageId();
        expect(first).toBeTruthy();
        expect(repo.ensureLineageId("something-else")).toBe(first);
        expect(repo.getLineageId()).toBe(first);

        doc.destroy();
    });

    it("is minted fresh for a doc rebuilt from a readable archive", async () => {
        const source = newProjectDoc("Source", "One");
        const sourceLineage = source.metadata().get("lineageId")!;

        const readable = await exportReadable(source);
        // The value *is* in the JSON — that is precisely the trap.
        expect(adapter.convertFrom(readable).metadata.lineageId).toBe(sourceLineage);

        const projectId = await createProjectFromScenarly(readable, { fork: false });
        createdProjects.push(projectId);

        const rebuiltLineage = await readProjectDoc(projectId, (doc) => doc.metadata().get("lineageId"));
        expect(rebuiltLineage).toBeTruthy();
        expect(rebuiltLineage).not.toBe(sourceLineage);

        // And so it can never merge into the lineage it names.
        await expect(applyScenarlyUpdate(projectId, readable)).rejects.toBeInstanceOf(ScenarlyMergeError);

        source.destroy();
    });

    it("survives a plain receipt of a binary archive, and is replaced by a fork", async () => {
        const source = newProjectDoc("Source", "One");
        const sourceLineage = source.metadata().get("lineageId")!;
        const archive = await exportBinary(source);

        const receivedId = await createProjectFromScenarly(archive, { fork: false });
        createdProjects.push(receivedId);
        const forkedId = await createProjectFromScenarly(archive, { fork: true });
        createdProjects.push(forkedId);

        expect(await readProjectDoc(receivedId, (d) => d.metadata().get("lineageId"))).toBe(sourceLineage);
        expect(await readProjectDoc(forkedId, (d) => d.metadata().get("lineageId"))).not.toBe(sourceLineage);

        // Both are rehomed into their own library slot.
        expect(await readProjectDoc(receivedId, (d) => d.metadata().get("id"))).toBe(receivedId);
        expect(await readProjectDoc(forkedId, (d) => d.metadata().get("id"))).toBe(forkedId);

        source.destroy();
    });
});

// ── R4: no flattening ─────────────────────────────────────────────────────────

describe("binary open keeps the CRDT (R4)", () => {
    it("produces a replica that still merges with its source without duplicating", async () => {
        const alice = newProjectDoc("Alice", "Shared line");
        const projectId = await createProjectFromScenarly(await exportBinary(alice), { fork: false });
        createdProjects.push(projectId);

        // Each side writes something the other has never seen.
        appendLine(alice, "a2", "Alice only");
        await readProjectDoc(projectId, (bob) => appendLine(bob, "b2", "Bob only"));

        const merged = replicaOf(alice);
        Y.applyUpdate(merged, await readProjectDoc(projectId, (bob) => Y.encodeStateAsUpdate(bob)));

        const text = lines(merged);
        // The shared line appears exactly once: the two docs are made of the same
        // operations, so the merge dedupes instead of concatenating.
        expect(text.filter((line) => line === "Shared line")).toHaveLength(1);
        expect(text).toContain("Alice only");
        expect(text).toContain("Bob only");

        alice.destroy();
        merged.destroy();
    });

    it("merges across three hops (Alice → Bob → Carol)", async () => {
        // Alice writes and shares.
        const alice = newProjectDoc("Alice", "Scene one");
        const aliceArchive = await exportBinary(alice);

        // Bob has no copy, so he receives it as a new project — lineage preserved.
        const bobId = await createProjectFromScenarly(aliceArchive, { fork: false });
        createdProjects.push(bobId);
        await readProjectDoc(bobId, (bob) => appendLine(bob, "b2", "Bob's rewrite"));
        const bobArchive = await readProjectDoc(bobId, (bob) => exportBinary(bob));

        // Bob is a different person on a different machine; his project is not in
        // Carol's library. (Leaving it here would make the open legitimately
        // ambiguous — two local projects on one lineage — which is a different
        // case, covered on its own below.)
        await deleteCachedProject(bobId);
        await clearYjsData(bobId);
        createdProjects.splice(createdProjects.indexOf(bobId), 1);

        // Carol already holds Alice's original, and has edited it herself.
        const carolDoc = replicaOf(alice);
        appendLine(carolDoc, "c2", "Carol's note");
        const carolId = await persistAsProject(carolDoc, "Carol");
        carolDoc.destroy();

        // Bob's file must merge into Carol's copy rather than being refused.
        const plan = await planScenarlyOpen(await bobArchive);
        expect(plan).toEqual({ kind: "diverged", projectId: carolId });

        await applyScenarlyUpdate(carolId, await bobArchive);

        const text = await readProjectDoc(carolId, lines);
        expect(text.filter((line) => line === "Scene one")).toHaveLength(1);
        expect(text).toContain("Bob's rewrite");
        expect(text).toContain("Carol's note");

        alice.destroy();
    });
});

// ── Planning ──────────────────────────────────────────────────────────────────

describe("planScenarlyOpen", () => {
    it("reports new-project when nothing local shares the lineage", async () => {
        const doc = newProjectDoc("Stranger", "One");
        expect(await planScenarlyOpen(await exportBinary(doc))).toEqual({ kind: "new-project" });
        doc.destroy();
    });

    it("reports already-current when the local copy holds everything", async () => {
        const doc = newProjectDoc("Mine", "One");
        const archive = await exportBinary(doc);

        const local = replicaOf(doc);
        appendLine(local, "a2", "Written since");
        const projectId = await persistAsProject(local, "Mine");
        local.destroy();

        expect(await planScenarlyOpen(archive)).toEqual({ kind: "already-current", projectId });
        doc.destroy();
    });

    it("reports fast-forward when the file is strictly ahead", async () => {
        const base = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(replicaOf(base), "Mine");

        appendLine(base, "a2", "Newer line");
        expect(await planScenarlyOpen(await exportBinary(base))).toEqual({
            kind: "fast-forward",
            projectId,
        });
        base.destroy();
    });

    it("reports diverged when both sides moved", async () => {
        const base = newProjectDoc("Mine", "One");
        const local = replicaOf(base);
        appendLine(local, "l2", "Local line");
        const projectId = await persistAsProject(local, "Mine");
        local.destroy();

        appendLine(base, "f2", "File line");
        expect(await planScenarlyOpen(await exportBinary(base))).toEqual({ kind: "diverged", projectId });
        base.destroy();
    });

    it("reports ambiguous when several local projects share the lineage", async () => {
        const base = newProjectDoc("Mine", "One");
        const first = await persistAsProject(replicaOf(base), "Copy A");
        const second = await persistAsProject(replicaOf(base), "Copy B");

        appendLine(base, "a2", "Newer");
        const plan = await planScenarlyOpen(await exportBinary(base));
        expect(plan.kind).toBe("ambiguous");
        expect((plan as { projectIds: string[] }).projectIds.sort()).toEqual([first, second].sort());
        base.destroy();
    });

    it("reports no-lineage for a readable archive", async () => {
        const doc = newProjectDoc("Mine", "One");
        expect(await planScenarlyOpen(await exportReadable(doc))).toEqual({ kind: "no-lineage" });
        doc.destroy();
    });

    it("reports no-lineage for a binary archive that was never stamped", async () => {
        const doc = new ProjectState();
        appendLine(doc, "a1", "Unstamped");
        expect(await planScenarlyOpen(await exportBinary(doc))).toEqual({ kind: "no-lineage" });
        doc.destroy();
    });

    it("reports future-version before it even looks for a local copy", async () => {
        const doc = newProjectDoc("Mine", "One");
        doc.transact(() => doc.metadata().set("version", 99));
        expect(await planScenarlyOpen(await exportBinary(doc))).toEqual({
            kind: "future-version",
            fileVersion: 99,
        });
        doc.destroy();
    });
});

// ── Applying ──────────────────────────────────────────────────────────────────

describe("applyScenarlyUpdate", () => {
    it("fast-forwards the local copy to the file's content", async () => {
        const base = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(replicaOf(base), "Mine");

        appendLine(base, "a2", "From the file");
        await applyScenarlyUpdate(projectId, await exportBinary(base));

        expect(await readProjectDoc(projectId, lines)).toEqual(["One", "From the file"]);
        base.destroy();
    });

    it("keeps edits unique to each side when they diverged", async () => {
        const base = newProjectDoc("Mine", "One");
        const local = replicaOf(base);
        appendLine(local, "l2", "Local only");
        const projectId = await persistAsProject(local, "Mine");
        local.destroy();

        appendLine(base, "f2", "File only");
        await applyScenarlyUpdate(projectId, await exportBinary(base));

        const text = await readProjectDoc(projectId, lines);
        expect(text).toContain("Local only");
        expect(text).toContain("File only");
        expect(text.filter((line) => line === "One")).toHaveLength(1);
        base.destroy();
    });

    it("takes a rollback snapshot before merging", async () => {
        const base = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(replicaOf(base), "Mine");

        appendLine(base, "a2", "From the file");
        await applyScenarlyUpdate(projectId, await exportBinary(base));

        const { getStorageProvider } = await import(
            "@src/lib/persistence/storage-provider/storage-provider"
        );
        const backup = await (await getStorageProvider()).loadMigrationBackup(projectId);
        expect(backup).not.toBeNull();

        // The snapshot is the pre-merge state, not the merged one.
        const restored = new ProjectState();
        Y.applyUpdate(restored, backup!.snapshot);
        expect(lines(restored)).toEqual(["One"]);
        restored.destroy();
        base.destroy();
    });

    it("refuses a file from a different lineage", async () => {
        const local = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(local, "Mine");

        const stranger = newProjectDoc("Theirs", "Something else");
        await expect(applyScenarlyUpdate(projectId, await exportBinary(stranger))).rejects.toMatchObject({
            reason: "lineage-mismatch",
        });
        expect(await readProjectDoc(projectId, lines)).toEqual(["One"]);

        local.destroy();
        stranger.destroy();
    });

    it("refuses a readable archive outright", async () => {
        const local = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(local, "Mine");

        await expect(applyScenarlyUpdate(projectId, await exportReadable(local))).rejects.toMatchObject({
            reason: "no-lineage",
        });
        expect(await readProjectDoc(projectId, lines)).toEqual(["One"]);
        local.destroy();
    });
});

// ── R5: version alignment ─────────────────────────────────────────────────────

describe("version alignment (R5)", () => {
    /**
     * A migration whose effect is visible in the content, not just in the version
     * field. Asserting on the version number alone would pass on exactly the bug
     * this rule exists to prevent: a last-writer-wins merge that stamps the doc
     * current while leaving old-shaped content behind.
     */
    const migrations: ProjectMigration[] = [
        {
            from: 1,
            to: 2,
            description: "Give every scene a synopsis",
            run: (doc) => {
                doc.scenes().forEach((scene, id) => {
                    if (!scene.synopsis) doc.scenes().set(id, { ...scene, synopsis: "migrated" });
                });
            },
        },
    ];

    it("migrates an older file before merging it, content and all", async () => {
        // Local is already current (v2) and holds a migrated scene.
        const local = newProjectDoc("Mine", "One");
        local.transact(() => {
            local.metadata().set("version", 2);
            local.scenes().set("s-local", { synopsis: "already here" } as never);
        });
        const projectId = await persistAsProject(local, "Mine");

        // The file is a peer that has not been opened since the app updated: v1,
        // with a scene the migration has never touched.
        const file = replicaOf(local);
        file.transact(() => {
            file.metadata().set("version", 1);
            file.scenes().set("s-file", {} as never);
        });
        appendLine(file, "f2", "From the older file");

        await applyScenarlyUpdate(projectId, await exportBinary(file), { migrations, currentVersion: 2 });

        const after = await readProjectDoc(projectId, (doc) => ({
            version: doc.metadata().get("version"),
            fileScene: doc.scenes().get("s-file"),
            text: lines(doc),
        }));

        expect(after.version).toBe(2);
        // The point of the test: the file's own content arrived in migrated shape.
        expect(after.fileScene).toEqual({ synopsis: "migrated" });
        expect(after.text).toContain("From the older file");

        local.destroy();
        file.destroy();
    });

    it("refuses a file from a newer build and leaves the local doc untouched", async () => {
        const local = newProjectDoc("Mine", "One");
        const projectId = await persistAsProject(local, "Mine");

        const file = replicaOf(local);
        file.transact(() => file.metadata().set("version", 99));
        appendLine(file, "f2", "From the future");

        await expect(
            applyScenarlyUpdate(projectId, await exportBinary(file), { migrations, currentVersion: 2 }),
        ).rejects.toMatchObject({ reason: "future-version" });

        const after = await readProjectDoc(projectId, (doc) => ({
            version: doc.metadata().get("version"),
            text: lines(doc),
        }));
        expect(after.text).toEqual(["One"]);
        expect(after.version).toBe(1);

        local.destroy();
        file.destroy();
    });
});

// ── Flat imports still work ───────────────────────────────────────────────────

describe("flat rebuilds", () => {
    it("still round-trip through applyProjectData with a fresh lineage", () => {
        const source = newProjectDoc("Source", "One");
        const data = projectDataOf(source);

        const rebuilt = new ProjectState();
        applyProjectData(rebuilt, data);
        rebuilt.metadata().delete("lineageId");
        const repo = createProjectRepository(rebuilt)!;
        repo.ensureLineageId();

        expect(lines(rebuilt)).toEqual(["One"]);
        expect(repo.getLineageId()).not.toBe(source.metadata().get("lineageId"));

        source.destroy();
        rebuilt.destroy();
    });
});

describe("opening a bound project file", () => {
    /**
     * Both containers wear the `.scenarly` extension: the ZIP is what Export
     * produces and what circulates, the block format is what a bound project is
     * written into. Double-clicking your own working copy has to open it, so the
     * open flow sniffs the magic number rather than trusting the name.
     */
    it("recognises one and plans against it like any other file", async () => {
        const source = newProjectDoc("Bound copy", "FADE IN:");

        const plan = await planScenarlyOpen(boundFile(source));
        // Nothing local descends from it yet, so it opens as a new project —
        // the same verdict the archive of the same document would get.
        expect(plan.kind).toBe("new-project");
        source.destroy();
    });

    it("creates a project from one", async () => {
        const source = newProjectDoc("Bound copy", "FADE IN:");

        const projectId = await createProjectFromScenarly(boundFile(source), { fork: false });
        createdProjects.push(projectId);

        expect((await readProjectDoc(projectId, lines)).join("\n")).toContain("FADE IN:");
        source.destroy();
    });

    it("merges one into the project it came from", async () => {
        const alice = newProjectDoc("Shared", "FADE IN:");

        const projectId = await createProjectFromScenarly(boundFile(alice), { fork: false });
        createdProjects.push(projectId);

        // The file moves on elsewhere — another machine, a synced folder.
        appendLine(alice, "a2", "She turns.");

        // Diverged rather than fast-forward, and correctly so: creating the
        // local project stamped it with its own id, which is an operation the
        // file has never seen. Both sides hold something the other lacks, which
        // is exactly the case a CRDT merge exists for.
        expect((await planScenarlyOpen(boundFile(alice))).kind).toBe("diverged");

        await applyScenarlyUpdate(projectId, boundFile(alice));
        expect((await readProjectDoc(projectId, lines)).join("\n")).toContain("She turns.");
        alice.destroy();
    });
});
