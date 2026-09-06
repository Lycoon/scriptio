/**
 * Opening a `.scriptio` file without destroying anything.
 *
 * The naive read of "open a file" is *replace the project with it*, and that is
 * the one behaviour this module must never have. The case it would ruin is
 * ordinary: someone sends you a `.scriptio` of a project you already have,
 * exported three weeks ago, and replacing your copy with it throws away three
 * weeks of writing. So the primitive here is a **CRDT merge**, which is a union
 * of operations and therefore cannot lose anything:
 *
 *   · file ahead of local  → the merge adopts the file's content wholesale,
 *                            which is the "the file should win" intuition,
 *                            arrived at for free rather than by overwriting
 *   · file behind local    → the merge is a no-op, and we say so
 *   · both moved           → both sets of edits survive, interleaved
 *
 * State vectors let us tell those three apart *before* touching anything, so the
 * dialog can name the situation instead of asking the user to guess.
 *
 * A merge is only sound between replicas — see {@link ProjectMetadata.lineageId}
 * — so everything here refuses rather than guesses when lineage is absent or
 * differs, and the raw Yjs update is carried end to end (never flattened to
 * JSON and rebuilt, which would silently make the result unmergeable forever).
 */

import * as Y from "yjs";

import {
    ProjectState,
    applyProjectData,
    clearProjectData,
    projectDataOf,
    withProjectDoc,
} from "@src/lib/project/project-state";
import { createProjectRepository, type ProjectRepository } from "@src/lib/project/project-repository";
import { replaceScreenplay } from "@src/lib/screenplay/editor";
import type { Editor } from "@tiptap/react";
import {
    CURRENT_PROJECT_VERSION,
    type ProjectMigration,
} from "@src/lib/project/migrations/project-migrations";
import {
    migrateProjectDocCore,
    readProjectDocVersion,
} from "@src/lib/project/migrations/project-migration-runner";
import { writeYjsDocumentLocally } from "@src/lib/persistence/y-local-provider";
import { getCachedProjects } from "@src/lib/persistence/storage-provider/local-persistence";
import { getStorageProvider } from "@src/lib/persistence/storage-provider/storage-provider";
import { createProjectShell } from "@src/lib/import/import-project";
import type { CookieUser } from "@src/lib/utils/types";

import { ScriptioAdapter, restoreScriptioAssets } from "./scriptio-adapter";
import { isProjectFile, openProjectFile, rangeReaderFor, readDocumentUpdate } from "@src/lib/persistence/project-file/reader";
import { restoreAssetsInto } from "@src/lib/persistence/project-file/restore";

// ── Plan ──────────────────────────────────────────────────────────────────────

/**
 * What opening this archive would mean for the local library. Computed before
 * anything is written, so the UI can describe the outcome and the user can
 * decline it.
 */
export type ScriptioOpenPlan =
    /** No local project descends from this file's document. */
    | { kind: "new-project" }
    /** A local replica already contains every operation the file holds. */
    | { kind: "already-current"; projectId: string }
    /** The file is strictly ahead: merging adopts its content. */
    | { kind: "fast-forward"; projectId: string }
    /** Both sides hold operations the other lacks; merging keeps both. */
    | { kind: "diverged"; projectId: string }
    /** A readable export (or an unstamped doc): mergeable into nothing. */
    | { kind: "no-lineage" }
    /** Written by a newer build than this one — refuse, don't guess (R5). */
    | { kind: "future-version"; fileVersion: number }
    /** Several local projects share this lineage; the user has to pick. */
    | { kind: "ambiguous"; projectIds: string[] };

/**
 * Does `source` hold operations that a peer at `targetStateVector` has not seen?
 *
 * The tempting test — "is the diff empty?" — has no fixed answer in bytes: an
 * update always carries the source's *entire* delete set alongside its structs,
 * so a diff with nothing new in it is still a non-trivial encoding whose size
 * depends on the document's deletion history. Hard-coding a byte count would
 * work on a fresh doc and quietly stop working on a well-edited one.
 *
 * So we ask the document what "nothing new" looks like *for itself*: the diff it
 * has against its own state vector. Both encodings carry the identical delete
 * set, so any difference between them is exactly the structs the target is
 * missing.
 */
export function hasOps(source: Y.Doc, targetStateVector: Uint8Array): boolean {
    const diff = Y.encodeStateAsUpdate(source, targetStateVector);
    const emptyDiff = Y.encodeStateAsUpdate(source, Y.encodeStateVector(source));

    if (diff.byteLength !== emptyDiff.byteLength) return true;
    for (let i = 0; i < diff.byteLength; i++) {
        if (diff[i] !== emptyDiff[i]) return true;
    }
    return false;
}

/**
 * Does `source` know about deletions `target` does not?
 *
 * Companion to {@link hasOps}, and not redundant with it: deleting content
 * consumes no clock, so a document whose only change is a deletion has the same
 * state vector it had before. Judging by structs alone, such a file looks
 * identical to the local copy and we would tell the user "already up to date"
 * while quietly dropping the scene they cut.
 */
function hasNewDeletions(source: Y.Doc, target: Y.Doc): boolean {
    const sourceDeletes = Y.createDeleteSetFromStructStore(source.store);
    const targetDeletes = Y.createDeleteSetFromStructStore(target.store);
    return !Y.equalDeleteSets(Y.mergeDeleteSets([sourceDeletes, targetDeletes]), targetDeletes);
}

// ── Reading the archive ───────────────────────────────────────────────────────

/** The archive's raw Yjs update, or null for a readable (`document.json`) one. */
function fileUpdateOf(bytes: ArrayBuffer): Uint8Array | null {
    return new ScriptioAdapter().extractYjsUpdate(bytes);
}

/**
 * The document a `.scriptio` holds, whichever container it arrived in.
 *
 * Two shapes carry the extension and both have to open. The ZIP archive is what
 * Export produces and what people send each other; the block format is what a
 * *bound* project is written into, so it is what the user double-clicks when the
 * file they are opening is their own working copy. Telling them apart is a magic
 * number at offset 0, never the extension.
 *
 * Read from memory here rather than by seeking: the open flow is handed the
 * whole file — by a drop, a picker, or the OS — and on web there is no path to
 * seek into. The bound writer takes the same reader over ranges instead.
 */
async function documentUpdateFrom(bytes: ArrayBuffer): Promise<Uint8Array | null> {
    const view = new Uint8Array(bytes);
    if (!isProjectFile(view)) return fileUpdateOf(bytes);

    const read = rangeReaderFor(view);
    return readDocumentUpdate(read, await openProjectFile(read, view.byteLength));
}

/** Restore the file's assets into `projectId`, whichever container it is. */
async function restoreAssetsFrom(projectId: string, bytes: ArrayBuffer): Promise<void> {
    const view = new Uint8Array(bytes);
    if (!isProjectFile(view)) {
        await restoreScriptioAssets(projectId, bytes);
        return;
    }

    const read = rangeReaderFor(view);
    await restoreAssetsInto(projectId, read, await openProjectFile(read, view.byteLength));
}

/**
 * Load the archive's document into a scratch `ProjectState`. The caller owns the
 * doc and must destroy it.
 */
function scratchDocFrom(update: Uint8Array): ProjectState {
    const doc = new ProjectState();
    Y.applyUpdate(doc, update);
    return doc;
}

/**
 * Replace an open project's contents with a `.scriptio` file's, from either
 * container.
 *
 * The sibling of {@link createProjectFromScriptio} for a project that already
 * exists — "import into this project" rather than "open as a new one". It lives
 * here rather than in `import-project` because deciding which container a
 * `.scriptio` is arrives with the document, and that decision belongs in one
 * place; the generic import path only knows extensions.
 *
 * A true replace, not a merge: every map and fragment is wiped first, so this
 * never blends the file into what was there. Callers wanting the merge
 * semantics want {@link applyScriptioUpdate}.
 */
export async function importScriptioIntoProject(
    bytes: ArrayBuffer,
    projectId: string,
    editor?: Editor | null,
    titlePageEditor?: Editor | null,
    repository?: ProjectRepository | null,
): Promise<void> {
    const update = await documentUpdateFrom(bytes);
    const ydoc = repository?.getState() as ProjectState | undefined;

    // A readable export carries no CRDT, and without a repository there is no
    // document to write into. Both fall back to the adapter's own path.
    if (!update || !ydoc) {
        new ScriptioAdapter().import(bytes, editor, titlePageEditor, repository ?? null);
        await restoreAssetsFrom(projectId, bytes);
        return;
    }

    clearProjectData(ydoc);
    Y.applyUpdate(ydoc, update);
    await restoreAssetsFrom(projectId, bytes);

    // Refreshed from the document we just wrote, not by re-parsing the file:
    // the bound container cannot be read synchronously, and this is the same
    // content either way.
    const projectData = projectDataOf(ydoc);
    if (editor && projectData.screenplay) replaceScreenplay(editor, projectData.screenplay);
    if (titlePageEditor && projectData.titlepage) {
        replaceScreenplay(titlePageEditor, projectData.titlepage);
    }
}

// ── Local replicas ────────────────────────────────────────────────────────────

/**
 * Run `fn` against a project's local Yjs document.
 *
 * Prefers the doc the editor session is already holding, because that is the one
 * the user is looking at: opening a second `y-indexeddb` provider over the same
 * database would eventually converge, but a merge applied to the detached copy
 * would not show up on screen until a reload. Falls back to the normal local
 * provider for projects that aren't open — never to raw IndexedDB, so the
 * y-indexeddb store layout stays that module's business.
 */
/** Milliseconds IndexedDB is given to flush a write before the provider goes. */
const LOCAL_FLUSH_MS = 100;

/** Every caller here may write through `fn`, so all of them wait for the flush. */
const withLocalDoc = <T>(projectId: string, fn: (doc: ProjectState) => Promise<T> | T): Promise<T> =>
    withProjectDoc(projectId, fn, { flushMs: LOCAL_FLUSH_MS });

/** Ids of every cached project whose document carries `lineageId`. */
async function projectsWithLineage(lineageId: string): Promise<string[]> {
    const projects = await getCachedProjects();
    const matches: string[] = [];

    for (const project of projects) {
        try {
            const found = await withLocalDoc(project.id, (doc) => doc.metadata().get("lineageId"));
            if (found === lineageId) matches.push(project.id);
        } catch (error) {
            // A project whose local database won't open can't be a merge target;
            // treat it as "not a match" rather than failing the whole open.
            console.warn("[Scriptio] Could not read lineage of project", project.id, error);
        }
    }

    return matches;
}

// ── Planning ──────────────────────────────────────────────────────────────────

/**
 * Classify what opening `bytes` would do, without writing anything.
 *
 * The version gate comes before the lineage lookup on purpose: a file this build
 * cannot interpret is refused outright (R5), whether or not we hold a replica of
 * it, because merging a doc whose shape we don't understand is the corruption
 * path this rule exists to close.
 */
export async function planScriptioOpen(
    bytes: ArrayBuffer,
    { currentVersion = CURRENT_PROJECT_VERSION }: SchemaOverrides = {},
): Promise<ScriptioOpenPlan> {
    const update = await documentUpdateFrom(bytes);
    if (!update) return { kind: "no-lineage" };

    const fileDoc = scratchDocFrom(update);
    try {
        const fileVersion = readProjectDocVersion(fileDoc);
        if (fileVersion > currentVersion) return { kind: "future-version", fileVersion };

        const lineageId = fileDoc.metadata().get("lineageId");
        if (!lineageId) return { kind: "no-lineage" };

        const matches = await projectsWithLineage(lineageId);
        if (matches.length === 0) return { kind: "new-project" };
        if (matches.length > 1) return { kind: "ambiguous", projectIds: matches };

        const projectId = matches[0];
        return withLocalDoc(projectId, (localDoc) => {
            const fileHasNew =
                hasOps(fileDoc, Y.encodeStateVector(localDoc)) || hasNewDeletions(fileDoc, localDoc);
            const localHasNew =
                hasOps(localDoc, Y.encodeStateVector(fileDoc)) || hasNewDeletions(localDoc, fileDoc);

            if (!fileHasNew) return { kind: "already-current", projectId } as const;
            if (!localHasNew) return { kind: "fast-forward", projectId } as const;
            return { kind: "diverged", projectId } as const;
        });
    } finally {
        fileDoc.destroy();
    }
}

// ── Applying ──────────────────────────────────────────────────────────────────

/**
 * Schema-version overrides. Production always uses the real migration table;
 * these exist so tests can drive the version-alignment rule with a fake
 * migration, the same way `migrateProjectDocCore` already allows.
 */
export interface SchemaOverrides {
    /** Override for tests; defaults to `PROJECT_MIGRATIONS`. */
    migrations?: ProjectMigration[];
    /** Override for tests; defaults to `CURRENT_PROJECT_VERSION`. */
    currentVersion?: number;
}

/** Thrown when a file cannot be merged; carries the reason for the dialog. */
export class ScriptioMergeError extends Error {
    constructor(
        message: string,
        readonly reason: "no-lineage" | "lineage-mismatch" | "future-version",
    ) {
        super(message);
        this.name = "ScriptioMergeError";
    }
}

/**
 * Bring the file's copy up to this build's schema version *inside its own
 * lineage*, before it is allowed anywhere near the local document.
 *
 * Merging an older file straight into a current doc is a genuine corruption
 * path, and a silent one: `metadata.version` is an ordinary Y.Map key, so the
 * merge resolves it last-writer-wins. If the current version wins, the document
 * ends up stamped current while holding content in the old shape, and the
 * migration runner will never revisit it — it only migrates on a version gap. So
 * we migrate the file's copy first, on its own.
 *
 * This costs nothing in mergeability. Migrations only *add* operations, so every
 * pre-existing op keeps its `(clientID, clock)` identity and still dedupes
 * against the local replica; the migration's own ops are new, and
 * `PROJECT_MIGRATIONS` already requires every step to be idempotent under CRDT
 * merge — this is the same situation as two clients migrating one cloud doc.
 *
 * The local side needs nothing here: it migrated when it was opened.
 */
async function alignFileVersion(fileDoc: ProjectState, overrides: SchemaOverrides): Promise<void> {
    const currentVersion = overrides.currentVersion ?? CURRENT_PROJECT_VERSION;
    const fileVersion = readProjectDocVersion(fileDoc);

    if (fileVersion > currentVersion) {
        throw new ScriptioMergeError(
            `File was written by a newer version of Scriptio (v${fileVersion})`,
            "future-version",
        );
    }
    if (fileVersion === currentVersion) return;

    await migrateProjectDocCore({
        ydoc: fileDoc,
        migrations: overrides.migrations,
        currentVersion,
    });
}

/**
 * Merge a `.scriptio` archive into an existing local project.
 *
 * Order matters and is fixed: verify lineage, version-align the file's copy
 * (R5), snapshot the local doc (R6), then apply the **raw update** so the result
 * stays a true replica (R4). A snapshot before every merge is what makes this
 * reversible if a file ever claims a lineage falsely, which is why it is taken
 * even when the merge looks trivial.
 */
export async function applyScriptioUpdate(
    projectId: string,
    bytes: ArrayBuffer,
    overrides: SchemaOverrides = {},
): Promise<void> {
    const update = await documentUpdateFrom(bytes);
    if (!update) {
        throw new ScriptioMergeError("This file is a readable export and holds no mergeable history", "no-lineage");
    }

    await applyDocumentUpdate(projectId, update, overrides, (id) => restoreAssetsFrom(id, bytes));
}

/**
 * The merge itself, over a raw Yjs update rather than an archive.
 *
 * Split out because the two things that carry a document — the `.scriptio`
 * export and the bound project file — package it completely differently but must
 * merge on identical terms. Everything the rule set turns on (lineage checked
 * before the apply, version alignment, the rollback snapshot) lives here so that
 * neither caller can drift from it.
 *
 * `restoreAssets` is how each caller brings its own images back, since those
 * live outside the CRDT and are stored differently in the two containers.
 */
export async function applyDocumentUpdate(
    projectId: string,
    update: Uint8Array,
    overrides: SchemaOverrides = {},
    restoreAssets?: (projectId: string) => Promise<void>,
): Promise<void> {
    const fileDoc = scratchDocFrom(update);
    try {
        const fileLineage = fileDoc.metadata().get("lineageId");
        if (!fileLineage) {
            throw new ScriptioMergeError("This file carries no lineage and cannot be merged", "no-lineage");
        }

        await alignFileVersion(fileDoc, overrides);
        const aligned = Y.encodeStateAsUpdate(fileDoc);

        await withLocalDoc(projectId, async (localDoc) => {
            // Compared *before* applying, never after: once the update lands, the
            // two lineage values have already merged and the check is meaningless.
            if (localDoc.metadata().get("lineageId") !== fileLineage) {
                throw new ScriptioMergeError(
                    "This file belongs to a different document and cannot be merged",
                    "lineage-mismatch",
                );
            }

            const provider = await getStorageProvider();
            await provider.saveMigrationBackup(
                projectId,
                Y.encodeStateAsUpdate(localDoc),
                readProjectDocVersion(localDoc),
            );

            try {
                Y.applyUpdate(localDoc, aligned);
            } catch (error) {
                const { restoreProjectFromBackup } = await import(
                    "@src/lib/project/migrations/project-migration-runner"
                );
                await restoreProjectFromBackup(projectId);
                throw error;
            }
        });

        // Board images and voice notes live outside the CRDT, so the merged
        // cards would reference nothing without this.
        await restoreAssets?.(projectId);
    } finally {
        fileDoc.destroy();
    }
}

// ── Creating ──────────────────────────────────────────────────────────────────

export interface CreateProjectFromScriptioOptions {
    /**
     * Whether the user is deliberately splitting this file off into a separate
     * document rather than receiving it.
     *
     * This flag decides the lineage of the result, and getting it backwards is
     * the difference between a file that circulates through a writing group and
     * one that fragments on every hop:
     *
     * · `false` — plain receipt. **Preserve** the file's lineage. The user is now
     *   a peer of whoever sent it, so the next file from that sender merges into
     *   this project instead of piling up as copies. Alice → Bob → Carol all end
     *   up on one lineage precisely because each hop preserves it.
     * · `true` — an explicit "open as a new project" taken while a local copy of
     *   this same document already exists. **Mint a fresh lineage.** The user has
     *   declared these to be separate documents; leaving the lineage shared would
     *   make the next file-open ambiguous between two local projects, and a fork
     *   does not merge back by definition.
     */
    fork: boolean;
    /** Project title; defaults to the one inside the archive. */
    title?: string;
    user?: CookieUser | null;
    isPro?: boolean;
}

/**
 * Create a new local project from a `.scriptio` archive.
 *
 * For a binary archive this builds a genuine **replica**: an empty doc with the
 * file's update applied, never a rebuild through `applyProjectData`. That single
 * choice is what keeps the new project mergeable with the file it came from (and
 * with every later export of it) — flattening would produce identical text made
 * of entirely fresh operations, which can never converge with the original.
 *
 * A readable archive has no history to preserve, so it takes the flat path and
 * is stamped with a fresh lineage, like any other import.
 */
export async function createProjectFromScriptio(
    bytes: ArrayBuffer,
    opts: CreateProjectFromScriptioOptions,
): Promise<string> {
    const update = await documentUpdateFrom(bytes);

    const ydoc = new ProjectState();
    try {
        if (update) {
            Y.applyUpdate(ydoc, update);
        } else {
            applyProjectData(ydoc, new ScriptioAdapter().convertFrom(bytes));
        }

        const metadata = ydoc.metadata();
        const title = opts.title || metadata.get("title") || "Untitled";
        const projectId = await createProjectShell(title, opts.user, opts.isPro);

        const repository = createProjectRepository(ydoc)!;
        ydoc.transact(() => {
            // The archive carries the id of the project it was exported from;
            // this document lives in a different slot now.
            metadata.set("id", projectId);
            if (metadata.get("version") === undefined) metadata.set("version", CURRENT_PROJECT_VERSION);

            // A fork, and anything rebuilt from a readable archive, is a new
            // document and must not claim the history it was made from.
            if (opts.fork || !update) metadata.delete("lineageId");
        });
        repository.ensureLineageId();

        await writeYjsDocumentLocally(projectId, ydoc);
        await restoreAssetsFrom(projectId, bytes);
        return projectId;
    } finally {
        ydoc.destroy();
    }
}
