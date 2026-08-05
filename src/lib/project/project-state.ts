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

const bumpProjectUpdatedAt = async (projectId: string): Promise<void> => {
    try {
        const { touchCachedProject } = await import("../persistence/storage-provider/local-persistence");
        await touchCachedProject(projectId);
    } catch (e) {
        console.warn("[project-state] failed to bump project updatedAt:", e);
    }
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
            entry.isCloudSynced = true;
            notifySubscribers(entry);
            return;
        }

        const { token, status } = await getCloudToken(entry.projectId);
        if (!isLive(entry)) return;
        if (!token) {
            entry.connectionStatus = "disconnected";
            entry.isCloudSynced = true;
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
            if (e.status === "connected" && cloudProvider.synced) entry.isCloudSynced = true;
            notifySubscribers(entry);
        });

        cloudProvider.on("sync", (isSynced: boolean) => {
            if (isSynced) {
                entry.isCloudSynced = true;
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
        entry.isCloudSynced = true;
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
    entry.state.on("update", (_update: Uint8Array, _origin: unknown, _doc: Y.Doc, tr: Y.Transaction) => {
        if (!tr.local || !entry.isLocalReady) return;
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
        entry.localProvider?.destroy();
        entry.state.destroy();
        sessionCache.delete(projectId);
    }, 0);
};

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
