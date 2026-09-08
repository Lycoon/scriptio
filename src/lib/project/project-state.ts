"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getRandomColor } from "@src/lib/utils/misc";
import { getCloudToken } from "../utils/requests";
import { JSONContent } from "@tiptap/react";
import { Screenplay } from "../utils/types";
import * as Y from "yjs";
import type { ThrottledWebsocketProvider } from "../cloud/utils";
import { ScreenplaySchema } from "../screenplay/editor";
import { TitlePageSchema } from "../titlepage/editor";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { YjsLocalProvider } from "../persistence/y-local-provider";
import { recordProjectUpdate } from "../persistence/update-log";
import type { ProjectMigrationOutcome } from "./migrations/project-migration-runner";

import { ProjectState } from "./project-doc";
import type { BoardData, ProjectData } from "./project-doc";

// Re-export all schema types & the class so existing consumers continue to
// import from "@src/lib/project/project-state" without changes.
export {
    ProjectState,
    DEFAULT_PAGE_MARGINS,
    DEFAULT_ELEMENT_MARGINS,
    DEFAULT_ELEMENT_STYLES,
    DEFAULT_SKIPPED_SCENE_LETTERS,
    TOGGLEABLE_SCENE_LETTERS,
    MAIN_SCREENPLAY_REF,
} from "./project-doc";
export type {
    ShelfEntryType,
    ShelfVersionMeta,
    ShelfEntry,
    ProjectMetadata,
    ElementMargin,
    PageMargin,
    ElementStyle,
    LayoutData,
    ProductionData,
    BoardCardData,
    BoardArrowData,
    BoardData,
    DocumentNode,
    DocumentNodeType,
    TimelineLayer,
    TimelineClip,
    TimelineClipSource,
    ProjectData,
    TypedMap,
} from "./project-doc";

// Lazy re-export repository for convenient access (avoid loading yjs at module level)
export const getProjectRepository = async () => {
    const mod = await import("./project-repository");
    return {
        ProjectRepository: mod.ProjectRepository,
        createProjectRepository: mod.createProjectRepository,
    };
};

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

/**
 * High-level state of a project from the layout's perspective. Replaces the
 * previous bag of `isReady` / `isProjectUnavailable` / `isStaleClient` /
 * `migrationOutcome` booleans — a single discriminated union makes the
 * priority of error states explicit and lets the layout switch on one value.
 *
 * Priority (highest first): needs-update > unavailable > loading > ready.
 */
export type ProjectStatusOutcome = Extract<
    ProjectMigrationOutcome,
    { kind: "future-version" | "failed" | "stale-client" }
>;

export type ProjectStatus =
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "needs-update"; outcome: ProjectStatusOutcome }
    | { kind: "unavailable" };

export interface ProjectYjsState {
    ydoc: ProjectState | null;
    provider: ThrottledWebsocketProvider | null;
    status: ProjectStatus;
    /**
     * True once the doc holds everything it is going to get before the user
     * touches it: the local cache has loaded *and* the cloud has synced (or is
     * known not to apply — local-only project, no token, offline, init error).
     *
     * `status.kind === "ready"` only covers the local half, so anything that
     * writes to the doc based on what is *missing* from it must wait for this
     * instead; see `seedTitlePage`.
     */
    isSynced: boolean;
    connectionStatus: ConnectionStatus;
    users: CollaboratorInfo[];
}

export interface CollaboratorInfo {
    name: string;
    color: string;
    userId?: string;
    clientId?: number;
}

export interface UserInfo {
    name: string;
    color: string;
    userId?: string;
}

// -------------------------------- //
//       LAZY-LOADED MODULES        //
// -------------------------------- //

// Cache for dynamically imported modules to avoid multiple imports
let yProtocolsModule: typeof import("y-protocols/awareness") | null = null;

async function getYProtocols() {
    if (!yProtocolsModule) {
        yProtocolsModule = await import("y-protocols/awareness");
    }
    return yProtocolsModule;
}

// -------------------------------- //
//   PROSEMIRROR HELPERS (browser)  //
// -------------------------------- //

/**
 * Convert the screenplay Y.XmlFragment to ProseMirror JSONContent[].
 * Browser-only: uses tiptap's ScreenplaySchema and y-prosemirror.
 */
export const screenplayOf = (ydoc: ProjectState): Screenplay => {
    const fragment = ydoc.screenplayFragment();
    const proseMirrorNode = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
    return proseMirrorNode.content.toJSON() as Screenplay;
};

/**
 * Convert the title-page Y.XmlFragment to ProseMirror JSONContent[].
 * Browser-only: uses tiptap's TitlePageSchema and y-prosemirror.
 */
export const titlepageOf = (ydoc: ProjectState): JSONContent[] => {
    const fragment = ydoc.titlepageFragment();
    const proseMirrorNode = yXmlFragmentToProseMirrorRootNode(fragment, TitlePageSchema);
    return proseMirrorNode.content.toJSON() as JSONContent[];
};

// -------------------------------- //
//   FULL PROJECT (DE)SERIALIZATION //
// -------------------------------- //

/** Convert a screenplay-schema Y.XmlFragment (editor docs, shelf versions) to JSON. */
const fragmentContentOf = (fragment: Y.XmlFragment): JSONContent[] =>
    yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema).content.toJSON() as JSONContent[];

/** Content of every `editor` document node's fragment, keyed by node id. */
const documentContentOf = (ydoc: ProjectState): Record<string, JSONContent[]> => {
    const result: Record<string, JSONContent[]> = {};
    ydoc.documents().forEach((node) => {
        if (node.type === "editor") result[node.id] = fragmentContentOf(ydoc.documentFragment(node.id));
    });
    return result;
};

/** Board data (cards + arrows) for every `board` node, keyed by node id. */
const boardContentOf = (ydoc: ProjectState): Record<string, BoardData> => {
    const result: Record<string, BoardData> = {};
    ydoc.documents().forEach((node) => {
        if (node.type === "board") result[node.id] = ydoc.boardData(node.id).toJSON();
    });
    return result;
};

/** Content of every shelf version, keyed by `${nodeId}::${versionId}`. */
const shelfContentOf = (ydoc: ProjectState): Record<string, JSONContent[]> => {
    const result: Record<string, JSONContent[]> = {};
    ydoc.shelf().forEach((entry, nodeId) => {
        for (const version of entry.versions) {
            result[`${nodeId}::${version.id}`] = fragmentContentOf(ydoc.shelfFragment(nodeId, version.id));
        }
    });
    return result;
};

/**
 * Serialize the entire project Y.Doc to a plain `ProjectData` — every map, both
 * screenplay/title-page fragments, and the dynamic per-document / per-board /
 * per-shelf-version content. Browser-only (uses ProseMirror conversion).
 */
export const projectDataOf = (ydoc: ProjectState): ProjectData => ({
    screenplay: screenplayOf(ydoc),
    titlepage: titlepageOf(ydoc),
    metadata: ydoc.metadata().toJSON(),
    characters: ydoc.characters().toJSON(),
    scenes: ydoc.scenes().toJSON(),
    pages: ydoc.pages().toJSON(),
    locations: ydoc.locations().toJSON(),
    layout: ydoc.layout().toJSON(),
    production: ydoc.production().toJSON(),
    comments: ydoc.comments().toJSON(),
    documents: ydoc.documents().toJSON(),
    timelineLayers: ydoc.timelineLayers().toJSON(),
    timelineClips: ydoc.timelineClips().toJSON(),
    shelf: ydoc.shelf().toJSON(),
    dictionary: ydoc.dictionary().toJSON(),
    documentContent: documentContentOf(ydoc),
    boardContent: boardContentOf(ydoc),
    shelfContent: shelfContentOf(ydoc),
});

/** Loosened Y.Map view used to bulk-write a record into a typed/plain map. */
const asMap = (m: object): Y.Map<unknown> => m as unknown as Y.Map<unknown>;

const fillMap = (map: Y.Map<unknown>, record: Record<string, unknown> | undefined): void => {
    if (!record) return;
    for (const [key, value] of Object.entries(record)) map.set(key, value);
};

/**
 * Write a (possibly partial) `ProjectData` into `ydoc`. Additive — it sets the
 * keys/fragments present in `data` without removing what is already there, so a
 * caller that needs a clean replace should `clearProjectData(ydoc)` first.
 * Browser-only (rebuilds fragments via ProseMirror).
 */
export const applyProjectData = (ydoc: ProjectState, data: Partial<ProjectData>): void => {
    ydoc.transact(() => {
        if (data.screenplay && data.screenplay.length > 0) {
            prosemirrorJSONToYXmlFragment(
                ScreenplaySchema,
                { type: "doc", content: data.screenplay },
                ydoc.screenplayFragment(),
            );
        }
        if (data.titlepage && data.titlepage.length > 0) {
            prosemirrorJSONToYXmlFragment(
                TitlePageSchema,
                { type: "doc", content: data.titlepage },
                ydoc.titlepageFragment(),
            );
        }

        fillMap(asMap(ydoc.metadata()), data.metadata);
        fillMap(asMap(ydoc.characters()), data.characters);
        fillMap(asMap(ydoc.locations()), data.locations);
        fillMap(asMap(ydoc.scenes()), data.scenes);
        fillMap(asMap(ydoc.pages()), data.pages);
        fillMap(asMap(ydoc.layout()), data.layout);
        fillMap(asMap(ydoc.production()), data.production);
        fillMap(asMap(ydoc.comments()), data.comments);
        fillMap(asMap(ydoc.documents()), data.documents);
        fillMap(asMap(ydoc.timelineLayers()), data.timelineLayers);
        fillMap(asMap(ydoc.timelineClips()), data.timelineClips);
        fillMap(asMap(ydoc.shelf()), data.shelf);
        fillMap(asMap(ydoc.dictionary()), data.dictionary);

        if (data.documentContent) {
            for (const [id, content] of Object.entries(data.documentContent)) {
                if (content.length === 0) continue;
                prosemirrorJSONToYXmlFragment(ScreenplaySchema, { type: "doc", content }, ydoc.documentFragment(id));
            }
        }
        if (data.boardContent) {
            for (const [id, board] of Object.entries(data.boardContent)) {
                const map = ydoc.boardData(id);
                for (const [key, value] of Object.entries(board)) {
                    map.set(key as keyof BoardData, value as BoardData[keyof BoardData]);
                }
            }
        }
        if (data.shelfContent) {
            for (const [key, content] of Object.entries(data.shelfContent)) {
                if (content.length === 0) continue;
                const sep = key.indexOf("::");
                const nodeId = key.slice(0, sep);
                const versionId = key.slice(sep + 2);
                prosemirrorJSONToYXmlFragment(
                    ScreenplaySchema,
                    { type: "doc", content },
                    ydoc.shelfFragment(nodeId, versionId),
                );
            }
        }
    });
};

/**
 * Remove every shared type's content from `ydoc` — both fragments, all maps, and
 * the dynamic per-document / per-board / per-shelf fragments — so an imported
 * state can fully replace the existing project instead of merging with it.
 */
export const clearProjectData = (ydoc: ProjectState): void => {
    ydoc.transact(() => {
        const screenplay = ydoc.screenplayFragment();
        if (screenplay.length > 0) screenplay.delete(0, screenplay.length);
        const titlepage = ydoc.titlepageFragment();
        if (titlepage.length > 0) titlepage.delete(0, titlepage.length);

        // Clear dynamic fragments before their owning maps, while the nodes that
        // reference them can still be enumerated.
        ydoc.documents().forEach((node) => {
            if (node.type === "editor") {
                const frag = ydoc.documentFragment(node.id);
                if (frag.length > 0) frag.delete(0, frag.length);
            } else if (node.type === "board") {
                ydoc.boardData(node.id).clear();
            }
        });
        ydoc.shelf().forEach((entry, nodeId) => {
            for (const version of entry.versions) {
                const frag = ydoc.shelfFragment(nodeId, version.id);
                if (frag.length > 0) frag.delete(0, frag.length);
            }
        });

        ydoc.metadata().clear();
        ydoc.characters().clear();
        ydoc.scenes().clear();
        ydoc.pages().clear();
        ydoc.locations().clear();
        ydoc.layout().clear();
        ydoc.production().clear();
        ydoc.comments().clear();
        ydoc.documents().clear();
        ydoc.timelineLayers().clear();
        ydoc.timelineClips().clear();
        ydoc.shelf().clear();
        ydoc.dictionary().clear();
    });
};

// -------------------------------- //
//        SESSION CACHE             //
// -------------------------------- //

/**
 * Per-projectId session cache holding the Yjs doc, the IndexedDB local
 * provider, and the cloud WebSocket provider. RefCount + a deferred dispose
 * timer let a synchronous unmount/remount pair (React StrictMode in dev,
 * route remounts) reuse the same resources instead of tearing them down and
 * rebuilding from scratch — which previously produced two disconnect/connect
 * cycles per page refresh in dev.
 */
type SessionEntry = {
    projectId: string;
    state: ProjectState;
    localProvider: YjsLocalProvider | null;
    cloudProvider: ThrottledWebsocketProvider | null;
    isLocalReady: boolean;
    isCloudSynced: boolean;
    isCloudInitStarted: boolean;
    migrationOutcome: ProjectMigrationOutcome | null;
    connectionStatus: ConnectionStatus;
    users: CollaboratorInfo[];
    isProjectUnavailable: boolean;
    isSessionReplaced: boolean;
    isStaleClient: boolean;
    currentUserInfo: UserInfo;
    lastUsersJson: string;
    refCount: number;
    disposeTimer: ReturnType<typeof setTimeout> | null;
    subscribers: Set<() => void>;
    // Timestamp of the last cached-updatedAt bump, to throttle them (see the
    // "update" observer in acquireSession).
    lastLocalEditTouchAt: number;
};

const sessionCache = new Map<string, SessionEntry>();

/**
 * The Y.Doc the editor session is holding for `projectId`, or null when the
 * project isn't open.
 *
 * Exposed so out-of-band writers (the `.scriptio` merge, the file-binding
 * write-back) act on the document the user is actually looking at rather than
 * on a second replica loaded beside it. Both would converge through IndexedDB
 * eventually, but only this one shows up on screen without a reload.
 */
export const getLiveProjectDoc = (projectId: string): ProjectState | null =>
    sessionCache.get(projectId)?.state ?? null;

/**
 * Run `fn` against a project's Yjs document — the live session doc when the
 * project is open, a temporary local replica otherwise.
 *
 * The rule this encodes is {@link getLiveProjectDoc}'s: act on the document the
 * user is looking at, and only load a second replica when there is no session.
 * It lives here, beside the cache it consults, because both out-of-band callers
 * need it — the `.scriptio` merge and the file-binding writer — and a second
 * copy of the rule is a second thing to keep in step.
 *
 * `flushMs` is for callers whose `fn` *writes*: a replica's provider is torn
 * down as soon as this returns, and IndexedDB needs a moment to flush first
 * (matching `writeYjsDocumentLocally`). Readers leave it at zero and pay
 * nothing. It never applies to the live doc, which nobody here owns.
 */
export async function withProjectDoc<T>(
    projectId: string,
    fn: (doc: ProjectState) => Promise<T> | T,
    { flushMs = 0 }: { flushMs?: number } = {},
): Promise<T> {
    const live = getLiveProjectDoc(projectId);
    if (live) return fn(live);

    const { createLocalYjsProvider } = await import("../persistence/y-local-provider");
    const doc = new ProjectState();
    const provider = await createLocalYjsProvider(projectId, doc);
    try {
        await new Promise<void>((resolve) => provider.on("synced", () => resolve()));
        return await fn(doc);
    } finally {
        if (flushMs > 0) await new Promise((resolve) => setTimeout(resolve, flushMs));
        provider.destroy();
        doc.destroy();
    }
}

const notifySubscribers = (entry: SessionEntry): void => {
    entry.subscribers.forEach((cb) => cb());
};

/**
 * Has the cache evicted this entry while we were awaiting? Used to bail out
 * of async init paths whose entry was disposed before they completed.
 */
const isLive = (entry: SessionEntry): boolean => sessionCache.get(entry.projectId) === entry;

// Minimum gap between cached-updatedAt bumps while editing. The screenplay content
// lives in this Yjs doc, separate from the cached project metadata, so a local
// edit is the only signal that "last edited" should move — but the projects list
// renders that at day-level granularity, so a coarse throttle is plenty and avoids
// an IndexedDB write per keystroke.
const PROJECT_TOUCH_THROTTLE_MS = 30_000;

/**
 * File-binding hooks, reached through dynamic imports.
 *
 * That module imports the `.scriptio` open flow, which imports this one, so a
 * static import here would close a cycle. Deferring also keeps the Tauri fs
 * plugin out of the initial graph on web, where no project is ever file-backed.
 *
 * The module handle is cached because the edit hook below runs on every
 * keystroke: after the first load this is a synchronous call, not an await per
 * character.
 */
let fileBindingModule: typeof import("../persistence/file-binding") | null = null;

const getFileBinding = async (): Promise<typeof import("../persistence/file-binding")> => {
    if (!fileBindingModule) fileBindingModule = await import("../persistence/file-binding");
    return fileBindingModule;
};

/**
 * Recording is statically imported, unlike the rest of the file-binding hooks:
 * `update-log` depends on nothing but yjs, so there is no cycle to break and no
 * Tauri plugin to keep out of the web bundle — and this runs on every keystroke,
 * where even a resolved dynamic import is a hop worth not taking.
 */
const notifyFileBindingEdit = (projectId: string): void => {
    // Deliberately does not load the module: this runs on every keystroke, and
    // an await there would put a microtask (and, the first time, a chunk fetch)
    // in the editor's update path. `loadFileBindingFor` loads it once when the
    // session becomes ready, which is before any edit can happen; until then
    // there is no binding to notify anyway.
    fileBindingModule?.scheduleFileWrite(projectId);
};

/**
 * Device-local version history, reached the same way and for the same reasons:
 * the module pulls in the storage provider and the retention machinery, and the
 * edit hook below runs on every keystroke — so the handle is cached and the
 * notify is synchronous.
 */
let localSnapshotsModule: typeof import("../saves/local-snapshots") | null = null;

const getLocalSnapshots = async (): Promise<typeof import("../saves/local-snapshots")> => {
    if (!localSnapshotsModule) localSnapshotsModule = await import("../saves/local-snapshots");
    return localSnapshotsModule;
};

/** Same rule as {@link notifyFileBindingEdit}: no await on the typing path. The
 *  scheduler is started on `synced`, before any edit can reach this, and a
 *  project it never started for is one this is a no-op for anyway. */
const notifyLocalSnapshotEdit = (projectId: string): void => {
    localSnapshotsModule?.notifyLocalSnapshotEdit(projectId);
};

/**
 * Start snapshotting — local-only projects only, since a cloud project's history
 * is the DurableObject's to keep.
 *
 * A cloud project is not simply skipped: it may still be carrying snapshots from
 * before it was promoted, and this is the one moment anything looks. See
 * `discardLocalSnapshots` for how they get stranded and why nothing else would
 * ever collect them. Same shape as the cloud asset reconcile — a sweep on open,
 * not on every edit.
 */
const startLocalSnapshotsFor = async (projectId: string): Promise<void> => {
    try {
        const { isLocalOnlyProject } = await import("../persistence/storage-provider/local-persistence");
        const snapshots = await getLocalSnapshots();
        if (await isLocalOnlyProject(projectId)) snapshots.startLocalSnapshots(projectId);
        else await snapshots.discardLocalSnapshots(projectId);
    } catch (e) {
        console.warn("[project-state] failed to start local snapshots:", e);
    }
};

/** Last chance to capture the final minute of work before the session goes. */
const releaseLocalSnapshotsFor = async (projectId: string): Promise<void> => {
    // Nothing was ever scheduled if the module never loaded, so don't load it
    // now just to tear down state that doesn't exist.
    if (!localSnapshotsModule) return;
    try {
        await localSnapshotsModule.flushLocalSnapshots(projectId);
        localSnapshotsModule.releaseLocalSnapshots(projectId);
    } catch (e) {
        console.warn("[project-state] failed to flush local snapshots:", e);
    }
};

const loadFileBindingFor = async (projectId: string): Promise<void> => {
    try {
        await (await getFileBinding()).loadFileBinding(projectId);
    } catch (e) {
        console.warn("[project-state] failed to load file binding:", e);
    }
};

/** Last chance to get the project's file up to date before the session goes. */
const releaseFileBindingFor = async (projectId: string): Promise<void> => {
    try {
        const { flushNow, releaseFileBinding } = await getFileBinding();
        await flushNow(projectId);
        releaseFileBinding(projectId);
    } catch (e) {
        console.warn("[project-state] failed to flush file binding:", e);
    }
};

const bumpProjectUpdatedAt = async (projectId: string): Promise<void> => {
    try {
        const { touchCachedProject } = await import("../persistence/storage-provider/local-persistence");
        await touchCachedProject(projectId);
    } catch (e) {
        console.warn("[project-state] failed to bump project updatedAt:", e);
    }
};

/**
 * Stamp the doc's `lineageId` if it has none yet — the "doc creation" moment for
 * a project whose Y.Doc is built lazily on first open rather than at the moment
 * its library row is written.
 *
 * Waits for the cloud half of sync, not just the local cache, for the same
 * reason `seedTitlePage` does: readiness only means IndexedDB has loaded, so a
 * second device would otherwise decide "this project has no lineage" while the
 * real doc — carrying the stamp the first device wrote — is still in flight, and
 * mint a competing one. `lineageId` is write-once by design
 * (`ProjectRepository.ensureLineageId`), so the guard here is about not racing
 * the value in, not about repeating the write.
 *
 * Read-only replicas are skipped by the repository's own write guard: a viewer
 * must not author ops, and the owner's stamp reaches them through sync anyway.
 */
const ensureDocLineage = async (entry: SessionEntry): Promise<void> => {
    // Cheap pre-check on the hot path — this runs from every cloud-sync
    // transition, and the overwhelming majority of them are on a stamped doc.
    if (entry.state.metadata().get("lineageId")) return;

    try {
        const { createProjectRepository } = await import("./project-repository");
        if (!isLive(entry)) return;
        createProjectRepository(entry.state)?.ensureLineageId();
    } catch (e) {
        console.warn("[project-state] failed to stamp project lineage:", e);
    }
};

/**
 * The cloud side has given us everything it is going to. Single chokepoint so
 * the lineage stamp above can hang off it rather than being repeated at each of
 * the five paths that reach this state (synced, local-only, no token, offline,
 * init error).
 */
const markCloudSynced = (entry: SessionEntry): void => {
    entry.isCloudSynced = true;
    void ensureDocLineage(entry);
};

const initLocalProvider = async (entry: SessionEntry): Promise<void> => {
    const { createLocalYjsProvider } = await import("../persistence/y-local-provider");
    if (!isLive(entry)) return;

    const localProvider = await createLocalYjsProvider(entry.projectId, entry.state);
    if (!isLive(entry)) {
        localProvider.destroy();
        return;
    }
    entry.localProvider = localProvider;

    localProvider.on("synced", async () => {
        const { migrateProjectDoc } = await import("./migrations/project-migration-runner");
        const outcome = await migrateProjectDoc({ ydoc: entry.state, projectId: entry.projectId });
        if (!isLive(entry)) return;
        entry.migrationOutcome = outcome;
        if (outcome.kind === "future-version" || outcome.kind === "failed") {
            notifySubscribers(entry);
            return;
        }
        entry.isLocalReady = true;
        notifySubscribers(entry);
        void loadFileBindingFor(entry.projectId);
        void startLocalSnapshotsFor(entry.projectId);
        void initCloudProvider(entry);
    });
};

const initCloudProvider = async (entry: SessionEntry): Promise<void> => {
    if (entry.isCloudInitStarted) return;
    entry.isCloudInitStarted = true;
    entry.connectionStatus = "connecting";
    notifySubscribers(entry);

    try {
        const { isTauri } = await import("@tauri-apps/api/core");
        const isDesktop = isTauri();

        const { isLocalOnlyProject } = await import("../persistence/storage-provider/local-persistence");
        if (await isLocalOnlyProject(entry.projectId)) {
            if (!isLive(entry)) return;
            entry.connectionStatus = "disconnected";
            markCloudSynced(entry);
            notifySubscribers(entry);
            return;
        }

        const { token, status } = await getCloudToken(entry.projectId);
        if (!isLive(entry)) return;
        if (!token) {
            entry.connectionStatus = "disconnected";
            markCloudSynced(entry);
            // 403 means the cloud project was deleted or the user was removed.
            // Surface the recovery dialog on both desktop and web — the local
            // cache is still valid and the user should choose what to do with it.
            if (status === 403) entry.isProjectUnavailable = true;
            notifySubscribers(entry);
            return;
        }

        const { ThrottledWebsocketProvider } = await import("../cloud/utils");
        if (!isLive(entry)) return;

        const cloudWsUrl = (process.env.NEXT_PUBLIC_CLOUD_URL || "").replace(/^http/, "ws");
        const cloudProvider = new ThrottledWebsocketProvider(cloudWsUrl, entry.projectId, entry.state, {
            params: { token, clientId: entry.state.clientID.toString() },
            userInfo: entry.currentUserInfo,
            disableBc: isDesktop,
        });
        entry.cloudProvider = cloudProvider;
        notifySubscribers(entry);

        cloudProvider.awareness.on("update", () => {
            const states = Array.from(cloudProvider.awareness.getStates().values());
            const uniqueUsers = new Map<string, CollaboratorInfo>();
            for (const s of states) {
                if (s.user) {
                    const user = s.user as CollaboratorInfo;
                    const key = user.userId || user.name;
                    if (!uniqueUsers.has(key)) uniqueUsers.set(key, user);
                }
            }
            const next = Array.from(uniqueUsers.values());
            const nextJson = JSON.stringify(next);
            if (nextJson !== entry.lastUsersJson) {
                entry.lastUsersJson = nextJson;
                entry.users = next;
                notifySubscribers(entry);
            }
        });

        cloudProvider.on("connection-error", async () => {
            // Skip terminal states — refreshing after a kick would just hit
            // cloud-token, get 403, and loop forever.
            if (cloudProvider.wasSessionReplaced || cloudProvider.wasKicked) return;
            console.warn("[ProjectYjs] Connection error, attempting to refresh token...");
            entry.connectionStatus = "connecting";
            notifySubscribers(entry);
            try {
                const { token: refreshed, status: refreshStatus } = await getCloudToken(entry.projectId);
                if (!isLive(entry)) return;
                if (refreshStatus === 403) {
                    cloudProvider.shouldConnect = false;
                    cloudProvider.disconnect();
                    entry.isProjectUnavailable = true;
                    entry.connectionStatus = "disconnected";
                    notifySubscribers(entry);
                    return;
                }
                if (refreshed) await cloudProvider.updateToken(refreshed);
            } catch (e) {
                console.warn("[ProjectYjs] Failed to refresh token:", e);
            }
        });

        cloudProvider.on("status", (e: { status: string }) => {
            entry.connectionStatus = e.status as ConnectionStatus;
            if (e.status === "connected" && cloudProvider.synced) markCloudSynced(entry);
            notifySubscribers(entry);
        });

        cloudProvider.on("sync", (isSynced: boolean) => {
            if (isSynced) {
                markCloudSynced(entry);
                notifySubscribers(entry);
            }
        });

        cloudProvider.on("session-replaced", () => {
            entry.isSessionReplaced = true;
            entry.connectionStatus = "disconnected";
            notifySubscribers(entry);
        });

        cloudProvider.on("kicked", () => {
            entry.isProjectUnavailable = true;
            entry.connectionStatus = "disconnected";
            notifySubscribers(entry);
        });

        cloudProvider.on("document-restored", async () => {
            console.log("[ProjectYjs] Document restored — clearing local cache and reloading");
            try {
                if (entry.localProvider?.clearData) {
                    await entry.localProvider.clearData();
                } else {
                    const { clearYjsData } = await import("../persistence/storage-provider/local-persistence");
                    await clearYjsData(entry.projectId);
                }
            } catch (e) {
                console.warn("[ProjectYjs] Failed to clear local cache:", e);
            }
            window.location.reload();
        });

        cloudProvider.on("stale-client-version", () => {
            console.warn("[ProjectYjs] Server rejected this client as stale");
            entry.isStaleClient = true;
            notifySubscribers(entry);
        });
    } catch (e) {
        console.error("[ProjectYjs] Failed to initialize provider:", e);
        if (!isLive(entry)) return;
        entry.connectionStatus = "disconnected";
        markCloudSynced(entry);
        notifySubscribers(entry);
    }
};

const acquireSession = (projectId: string, userInfo: UserInfo): SessionEntry => {
    const existing = sessionCache.get(projectId);
    if (existing) {
        existing.refCount++;
        existing.currentUserInfo = userInfo;
        existing.cloudProvider?.setUserInfo(userInfo);
        if (existing.disposeTimer) {
            clearTimeout(existing.disposeTimer);
            existing.disposeTimer = null;
        }
        return existing;
    }

    const entry: SessionEntry = {
        projectId,
        state: new ProjectState(),
        localProvider: null,
        cloudProvider: null,
        isLocalReady: false,
        isCloudSynced: false,
        isCloudInitStarted: false,
        migrationOutcome: null,
        connectionStatus: "disconnected",
        users: [],
        isProjectUnavailable: false,
        isSessionReplaced: false,
        isStaleClient: false,
        currentUserInfo: userInfo,
        lastUsersJson: "",
        refCount: 1,
        disposeTimer: null,
        subscribers: new Set(),
        lastLocalEditTouchAt: 0,
    };
    sessionCache.set(projectId, entry);

    // Bump the project's cached "last edited" on local edits. The content is in
    // this doc, not the cached project row, so nothing else moves updatedAt. Only
    // local transactions count (tr.local ignores remote/collab sync and the initial
    // IndexedDB load), and only once the doc is ready (isLocalReady ignores the
    // load/migration writes that run before it flips). The doc's own destroy() on
    // session dispose removes this observer.
    entry.state.on("update", (update: Uint8Array, _origin: unknown, _doc: Y.Doc, tr: Y.Transaction) => {
        if (!entry.isLocalReady) return;

        // Every update reaching the document goes into the bound file's log,
        // local or remote alike: the log's job is to reproduce this document, and
        // a collaborator's edit is content the file would otherwise never carry.
        // Only the scheduling below is local-only. A no-op unless the project has
        // a file bound and its log is armed (see update-log).
        recordProjectUpdate(entry.projectId, update);

        if (!tr.local) return;

        // Restart the bound file's idle timer on every edit. Unthrottled, unlike
        // the updatedAt bump below: this only resets a timer, and throttling it
        // would let a burst of typing start a write mid-burst.
        notifyFileBindingEdit(entry.projectId);
        notifyLocalSnapshotEdit(entry.projectId);

        const now = Date.now();
        if (now - entry.lastLocalEditTouchAt < PROJECT_TOUCH_THROTTLE_MS) return;
        entry.lastLocalEditTouchAt = now;
        void bumpProjectUpdatedAt(entry.projectId);
    });

    void initLocalProvider(entry);
    return entry;
};

const releaseSession = (projectId: string): void => {
    const entry = sessionCache.get(projectId);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount > 0) return;

    // Defer disposal so a synchronous remount (StrictMode) can cancel it via
    // clearTimeout in acquireSession before the resources are torn down.
    entry.disposeTimer = setTimeout(async () => {
        entry.disposeTimer = null;
        if (entry.refCount > 0) return;

        if (entry.cloudProvider) {
            try {
                const { removeAwarenessStates } = await getYProtocols();
                removeAwarenessStates(entry.cloudProvider.awareness, [entry.state.clientID], "session release");
            } catch {}
            entry.cloudProvider.destroy();
        }
        // Before the doc goes: the debounce may still be pending, and closing a
        // project is exactly when the file must be current.
        await releaseFileBindingFor(projectId);
        await releaseLocalSnapshotsFor(projectId);

        entry.localProvider?.destroy();
        entry.state.destroy();
        sessionCache.delete(projectId);
    }, 0);
};

/**
 * Tear a session down now, regardless of who is still holding it.
 *
 * Only for the restore below, where the live doc has become a liability: it
 * holds the pre-restore content, and Yjs is additive, so there is no way to walk
 * it back. Leaving it in the cache would make it the answer `withProjectDoc`
 * gives every out-of-band writer that runs before the reload — which is exactly
 * how the restored document would get written back over the bound file.
 */
const discardSession = (projectId: string): void => {
    const entry = sessionCache.get(projectId);
    if (!entry) return;
    sessionCache.delete(projectId);
    if (entry.disposeTimer) {
        clearTimeout(entry.disposeTimer);
        entry.disposeTimer = null;
    }
    entry.cloudProvider?.destroy();
    entry.localProvider?.destroy();
    entry.state.destroy();
};

/**
 * Replace a local project's document with a stored version.
 *
 * The local twin of the `document-restored` handler above, and it works the same
 * way, because it has to: a CRDT only ever grows, so "restore" cannot mean
 * applying an old update to the current doc — it means throwing the current doc
 * away and rebuilding from the snapshot. Hence clearing IndexedDB rather than
 * writing over it, and a reload (the caller's) rather than a re-render.
 *
 * The restored bytes may be from any past version of the schema; nothing here
 * migrates them, because the reload's `synced` handler runs `migrateProjectDoc`
 * on whatever it loads — the same job the Worker does inline after its restore,
 * where there is no reload to do it.
 *
 * Does not reload the page itself: the caller has a bound file to rewrite from
 * the restored document first, and navigation would take the page away
 * mid-write. See `restoreLocalSnapshot`.
 */
export async function restoreLocalDocument(projectId: string, update: Uint8Array): Promise<void> {
    const entry = sessionCache.get(projectId);
    try {
        if (entry?.localProvider?.clearData) {
            await entry.localProvider.clearData();
            // clearData destroys the provider on its way out; forget it here so
            // the teardown below doesn't destroy it a second time.
            entry.localProvider = null;
        } else {
            const { clearYjsData } = await import("../persistence/storage-provider/local-persistence");
            await clearYjsData(projectId);
        }
    } catch (e) {
        console.warn("[project-state] failed to clear local cache before restore:", e);
    }

    const restored = new ProjectState();
    Y.applyUpdate(restored, update);
    const { writeYjsDocumentLocally } = await import("../persistence/y-local-provider");
    await writeYjsDocumentLocally(projectId, restored);
    restored.destroy();

    discardSession(projectId);
}

// -------------------------------- //
//          MAIN HOOK               //
// -------------------------------- //

export interface UseProjectYjsOptions {
    projectId: string | null;
    userName?: string;
    userColor?: string;
    userId?: string;
}

const computeStatus = (entry: SessionEntry | null): ProjectStatus => {
    if (!entry) return { kind: "loading" };
    if (entry.isStaleClient) {
        return { kind: "needs-update", outcome: { kind: "stale-client" } };
    }
    if (entry.migrationOutcome?.kind === "future-version" || entry.migrationOutcome?.kind === "failed") {
        return { kind: "needs-update", outcome: entry.migrationOutcome };
    }
    if (entry.isProjectUnavailable) return { kind: "unavailable" };
    if (!entry.isLocalReady) return { kind: "loading" };
    return { kind: "ready" };
};

export const useProjectYjs = ({
    projectId,
    userName,
    userColor,
    userId,
}: UseProjectYjsOptions): ProjectYjsState & {
    refreshAndReconnect: () => Promise<void>;
} => {
    const [fallback] = useState(() => ({
        name: `User_${Math.floor(Math.random() * 1000)}`,
        color: getRandomColor(),
    }));
    const userInfo = useMemo<UserInfo>(
        () => ({
            name: userName || fallback.name,
            color: userColor || fallback.color,
            userId,
        }),
        [userName, userColor, userId, fallback.name, fallback.color],
    );

    const entryRef = useRef<SessionEntry | null>(null);
    const [, setVersion] = useState(0);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") {
            entryRef.current = null;
            setVersion((v) => v + 1);
            return;
        }

        const entry = acquireSession(projectId, userInfo);
        entryRef.current = entry;
        const onChange = () => setVersion((v) => v + 1);
        entry.subscribers.add(onChange);
        setVersion((v) => v + 1);

        const handleUnload = async () => {
            if (entry.cloudProvider) {
                const { removeAwarenessStates } = await getYProtocols();
                removeAwarenessStates(entry.cloudProvider.awareness, [entry.state.clientID], "window unload");
            }
        };
        window.addEventListener("beforeunload", handleUnload);

        return () => {
            window.removeEventListener("beforeunload", handleUnload);
            entry.subscribers.delete(onChange);
            entryRef.current = null;
            releaseSession(projectId);
        };
        // userInfo is intentionally NOT in the deps: re-acquiring on every
        // userInfo change would defeat the cache. Updates flow via the
        // separate effect below, which calls setUserInfo on the live provider.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    useEffect(() => {
        const entry = entryRef.current;
        if (!entry) return;
        entry.currentUserInfo = userInfo;
        entry.cloudProvider?.setUserInfo(userInfo);
    }, [userInfo]);

    const refreshAndReconnect = useCallback(async () => {
        const entry = entryRef.current;
        if (!entry?.cloudProvider || !projectId) return;
        try {
            const { token, status } = await getCloudToken(projectId);
            if (status === 403) {
                entry.cloudProvider.shouldConnect = false;
                entry.cloudProvider.disconnect();
                entry.isProjectUnavailable = true;
                entry.connectionStatus = "disconnected";
                notifySubscribers(entry);
                return;
            }
            if (token) await entry.cloudProvider.updateToken(token);
        } catch (e) {
            console.warn("[ProjectYjs] Failed to refresh token:", e);
        }
    }, [projectId]);

    const entry = entryRef.current;
    return {
        ydoc: entry?.state ?? null,
        provider: entry?.cloudProvider ?? null,
        status: computeStatus(entry),
        isSynced: !!entry && entry.isLocalReady && entry.isCloudSynced,
        connectionStatus: entry?.connectionStatus ?? "disconnected",
        users: entry?.users ?? [],
        refreshAndReconnect,
    };
};

// -------------------------------- //
//          UTILITY HOOKS           //
// -------------------------------- //

/**
 * Hook to observe a Y.Map and re-render on changes
 */
const ymapToMap = <T>(ymap: Y.Map<T>): Map<string, T> => {
    const result = new Map<string, T>();
    ymap.forEach((value, key) => result.set(key, value));
    return result;
};

export const useYMap = <T>(ymap: Y.Map<T> | null): Map<string, T> => {
    const cache = useRef<Map<string, T>>(new Map());
    return useSyncExternalStore(
        useCallback(
            (callback: () => void) => {
                if (!ymap) {
                    cache.current = new Map();
                    return () => {};
                }
                cache.current = ymapToMap(ymap);
                const observer = () => {
                    cache.current = ymapToMap(ymap);
                    callback();
                };
                ymap.observe(observer);
                return () => ymap.unobserve(observer);
            },
            [ymap],
        ),
        () => cache.current,
        () => new Map(),
    );
};

/**
 * Hook to observe a Y.Array and re-render on changes
 */
export const useYArray = <T>(yarray: Y.Array<T> | null): T[] => {
    const cache = useRef<T[]>([]);
    return useSyncExternalStore(
        useCallback(
            (callback: () => void) => {
                if (!yarray) {
                    cache.current = [];
                    return () => {};
                }
                cache.current = yarray.toArray();
                const observer = () => {
                    cache.current = yarray.toArray();
                    callback();
                };
                yarray.observe(observer);
                return () => yarray.unobserve(observer);
            },
            [yarray],
        ),
        () => cache.current,
        () => [],
    );
};
