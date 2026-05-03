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
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { CharacterMap } from "../screenplay/characters";
import type { LocationMap } from "../screenplay/locations";
import type { PersistentSceneMap } from "../screenplay/scenes";
import type { YjsLocalProvider } from "../persistence/y-local-provider";
import type { ProjectMigrationOutcome } from "./migrations/project-migration-runner";

import { ProjectState } from "./project-doc";

// Re-export all schema types & the class so existing consumers continue to
// import from "@src/lib/project/project-state" without changes.
export {
    ProjectState,
    DEFAULT_PAGE_MARGINS,
    DEFAULT_ELEMENT_MARGINS,
    DEFAULT_ELEMENT_STYLES,
    getCharactersMap,
    getLocationsMap,
    getScenesMap,
    getBoardMap,
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
    BoardCardData,
    BoardArrowData,
    BoardData,
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

export interface ProjectYjsState {
    ydoc: ProjectState | null;
    provider: ThrottledWebsocketProvider | null;
    isLocalReady: boolean;
    isCloudReady: boolean;
    isCloudSynced: boolean;
    connectionStatus: ConnectionStatus;
    users: CollaboratorInfo[];
    isLockedByServer: boolean;
    isSessionReplaced: boolean;
    isProjectUnavailable: boolean;
    isStaleClient: boolean;
    migrationOutcome: ProjectMigrationOutcome | null;
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

/**
 * Utility to clear the local IndexedDB cache for a specific project.
 * Used when the server restores a document from a snapshot to avoid merge conflicts.
 */
export async function clearLocalProjectCache(projectId: string): Promise<void> {
    try {
        const { IndexeddbPersistence } = await import("y-indexeddb");
        const tmpDoc = new Y.Doc();
        const tmpPersistence = new IndexeddbPersistence(`scriptio-${projectId}`, tmpDoc);

        // Check if clearData is available on the persistence instance
        const provider = tmpPersistence as unknown as { clearData?: () => Promise<void> };
        if (typeof provider.clearData === "function") {
            await provider.clearData();
        }

        tmpPersistence.destroy();
        tmpDoc.destroy();
    } catch (e) {
        console.warn(`[ProjectState] Failed to clear local cache for ${projectId}:`, e);
    }
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
//          LOCAL PERSISTENCE       //
// -------------------------------- //

/**
 * Hook to initialize local persistence for the Yjs document.
 */
export const useLocalPersistence = (projectId: string | null) => {
    const [ydoc, setYdoc] = useState<ProjectState | null>(null);
    const [isLocalReady, setIsLocalReady] = useState(false);
    const [migrationOutcome, setMigrationOutcome] = useState<ProjectMigrationOutcome | null>(null);
    const persistenceRef = useRef<YjsLocalProvider | null>(null);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") {
            setYdoc(null);
            setIsLocalReady(false);
            setMigrationOutcome(null);
            return;
        }

        let isDestroyed = false;
        const initPersistence = async () => {
            const state = new ProjectState();
            const { createLocalYjsProvider } = await import("../persistence/y-local-provider");
            const localProvider = await createLocalYjsProvider(projectId, state);

            localProvider.on("synced", async () => {
                if (isDestroyed) return;
                const { migrateProjectDoc } = await import("./migrations/project-migration-runner");
                const outcome = await migrateProjectDoc({ ydoc: state, projectId });
                if (isDestroyed) return;
                setMigrationOutcome(outcome);
                if (outcome.kind === "future-version" || outcome.kind === "failed") {
                    // Block UI from rendering the project; layout shows error dialog instead.
                    return;
                }
                setIsLocalReady(true);
            });

            persistenceRef.current = localProvider;

            if (!isDestroyed) {
                setYdoc(state);
            }
        };

        initPersistence();

        return () => {
            isDestroyed = true;
            if (persistenceRef.current) {
                persistenceRef.current.destroy();
                persistenceRef.current = null;
            }
            setYdoc((prev) => {
                prev?.destroy();
                return null;
            });
            setIsLocalReady(false);
            setMigrationOutcome(null);
        };
    }, [projectId]);

    return { ydoc, isLocalReady, migrationOutcome };
};

// -------------------------------- //
//          CLOUD SYNC              //
// -------------------------------- //

/**
 * Hook to manage cloud WebSocket synchronization.
 */
export const useCloudSync = (
    projectId: string | null,
    ydoc: ProjectState | null,
    userInfo: UserInfo,
) => {
    const [provider, setProvider] = useState<ThrottledWebsocketProvider | null>(null);
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [isCloudSynced, setIsCloudSynced] = useState(false);
    const [isLockedByServer] = useState(false);
    const [isSessionReplaced] = useState(false);
    const [isProjectUnavailable, setIsProjectUnavailable] = useState(false);
    const [isStaleClient, setIsStaleClient] = useState(false);

    const isMountedRef = useRef(true);
    const providerRef = useRef<ThrottledWebsocketProvider | null>(null);
    const lastUsersJsonRef = useRef<string>("");

    // Use ref for userInfo to avoid triggering effects on every render
    const userInfoRef = useRef(userInfo);
    useEffect(() => {
        userInfoRef.current = userInfo;
    }, [userInfo]);

    // Ref for the refresh function so it can be called from event handlers
    const refreshAndReconnectRef = useRef<() => Promise<void>>();

    // Refresh token and reconnect
    const refreshAndReconnect = useCallback(async () => {
        if (!providerRef.current || !projectId) return;

        try {
            const { token } = await getCloudToken(projectId);
            if (token && isMountedRef.current) {
                await providerRef.current.updateToken(token);
            }
        } catch (e) {
            console.warn("[ProjectYjs] Failed to refresh token:", e);
        }
    }, [projectId]);

    // Keep the ref up to date
    useEffect(() => {
        refreshAndReconnectRef.current = refreshAndReconnect;
    }, [refreshAndReconnect]);

    // Initialize provider when doc is ready
    useEffect(() => {
        isMountedRef.current = true;
        setIsProjectUnavailable(false);

        if (!ydoc || !projectId || typeof window === "undefined") {
            setConnectionStatus("disconnected");
            return;
        }

        // If provider already exists for this doc, don't recreate
        if (providerRef.current) {
            return;
        }

        const setupProvider = async () => {
            setConnectionStatus("connecting");

            try {
                // Check if we're in Tauri environment first
                const { isTauri } = await import("@tauri-apps/api/core");
                const isDesktop = isTauri();

                // Local-only projects (not cloud-synced) don't need cloud sync
                const { isLocalOnlyProject } =
                    await import("../persistence/storage-provider/local-persistence");
                if (await isLocalOnlyProject(projectId)) {
                    setConnectionStatus("disconnected");
                    setIsCloudSynced(true);
                    return;
                }

                const { token, status } = await getCloudToken(projectId);
                if (!token || !isMountedRef.current) {
                    setConnectionStatus("disconnected");
                    setIsCloudSynced(true); // Mark as "synced" so isReady becomes true

                    // 403 means the cloud project was deleted or the user was removed.
                    // Surface the recovery dialog on both desktop and web — the local
                    // cache is still valid and the user should choose what to do with it.
                    if (status === 403) {
                        setIsProjectUnavailable(true);
                    }
                    return;
                }

                // Dynamically import collaboration utils
                const { ThrottledWebsocketProvider } = await import("../cloud/utils");

                const cloudWsUrl = (process.env.NEXT_PUBLIC_CLOUD_URL || "").replace(/^http/, "ws");
                const cloudProvider = new ThrottledWebsocketProvider(
                    cloudWsUrl,
                    projectId,
                    ydoc,
                    {
                        params: {
                            token,
                            clientId: ydoc.clientID.toString(),
                        },
                        userInfo: userInfoRef.current,
                        disableBc: isDesktop,
                    },
                );

                // Track connected users - only update state if users actually changed
                cloudProvider.awareness.on("update", () => {
                    if (!isMountedRef.current) return;

                    const states = Array.from(cloudProvider.awareness.getStates().values());
                    const uniqueUsersMap = new Map<string, CollaboratorInfo>();

                    for (const state of states) {
                        if (state.user) {
                            const user = state.user as CollaboratorInfo;
                            const key = user.userId || user.name;
                            if (!uniqueUsersMap.has(key)) {
                                uniqueUsersMap.set(key, user);
                            }
                        }
                    }

                    const connectedUsers = Array.from(uniqueUsersMap.values());
                    const usersJson = JSON.stringify(connectedUsers);
                    if (usersJson !== lastUsersJsonRef.current) {
                        lastUsersJsonRef.current = usersJson;
                        setUsers(connectedUsers);
                    }
                });

                // Handle connection errors
                cloudProvider.on("connection-error", async () => {
                    if (cloudProvider.wasSessionReplaced) return;
                    console.warn("[ProjectYjs] Connection error, attempting to refresh token...");
                    if (isMountedRef.current) {
                        setConnectionStatus("connecting");
                        if (refreshAndReconnectRef.current) {
                            await refreshAndReconnectRef.current();
                        } else {
                            cloudProvider.scheduleReconnect();
                        }
                    }
                });

                // Status updates
                cloudProvider.on("status", (e: { status: string }) => {
                    if (isMountedRef.current) {
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                setConnectionStatus(e.status as ConnectionStatus);
                                if (e.status === "connected" && cloudProvider.synced) {
                                    setIsCloudSynced(true);
                                }
                            }
                        }, 0);
                    }
                });

                // Track when initial cloud sync completes
                cloudProvider.on("sync", (isSynced: boolean) => {
                    if (isMountedRef.current && isSynced) {
                        setIsCloudSynced(true);
                    }
                });

                // Handle document restore
                cloudProvider.on("document-restored", async () => {
                    if (!isMountedRef.current) return;
                    console.log(
                        "[ProjectYjs] Document restored — clearing local cache and reloading",
                    );
                    await clearLocalProjectCache(projectId);
                    window.location.reload();
                });

                // Server rejected this client as stale — its bundle predates
                // the doc's schema version. Surface to the UI so the user is
                // prompted to update.
                cloudProvider.on("stale-client-version", () => {
                    if (!isMountedRef.current) return;
                    console.warn("[ProjectYjs] Server rejected this client as stale");
                    setIsStaleClient(true);
                });

                // Poll for synced status
                const checkSynced = () => {
                    if (!isMountedRef.current) return;
                    if (cloudProvider.synced) {
                        setIsCloudSynced(true);
                    } else {
                        setTimeout(checkSynced, 100);
                    }
                };
                setTimeout(checkSynced, 50);

                providerRef.current = cloudProvider;
                setProvider(cloudProvider);
            } catch (e) {
                console.error("[ProjectYjs] Failed to initialize provider:", e);
                if (isMountedRef.current) {
                    setConnectionStatus("disconnected");
                    setIsCloudSynced(true);
                }
            }
        };

        setupProvider();

        const handleUnload = async () => {
            if (providerRef.current && ydoc) {
                const { removeAwarenessStates } = await getYProtocols();
                removeAwarenessStates(
                    providerRef.current.awareness,
                    [ydoc.clientID],
                    "window unload",
                );
            }
        };

        window.addEventListener("beforeunload", handleUnload);

        return () => {
            isMountedRef.current = false;
            window.removeEventListener("beforeunload", handleUnload);
        };
    }, [ydoc, projectId]);

    useEffect(() => {
        if (providerRef.current) {
            providerRef.current.setUserInfo(userInfo);
        }
    }, [userInfo]);

    useEffect(() => {
        return () => {
            if (providerRef.current) {
                if (ydoc) {
                    getYProtocols().then(({ removeAwarenessStates }) => {
                        if (providerRef.current) {
                            removeAwarenessStates(
                                providerRef.current.awareness,
                                [ydoc.clientID],
                                "component unmount",
                            );
                            providerRef.current.destroy();
                            providerRef.current = null;
                            setProvider(null);
                        }
                    });
                } else {
                    providerRef.current.destroy();
                    providerRef.current = null;
                    setProvider(null);
                }
            }
        };
    }, [ydoc]);

    return {
        provider,
        users,
        connectionStatus,
        isCloudSynced,
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
        isProjectUnavailable,
        isStaleClient,
    };
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

export const useProjectYjs = ({
    projectId,
    userName,
    userColor,
    userId,
}: UseProjectYjsOptions): ProjectYjsState & {
    isReady: boolean;
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

    const { ydoc, isLocalReady, migrationOutcome } = useLocalPersistence(projectId);
    const {
        provider,
        users,
        connectionStatus,
        isCloudSynced,
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
        isProjectUnavailable,
        isStaleClient,
    } = useCloudSync(projectId, isLocalReady ? ydoc : null, userInfo);

    // isReady: project is ready when ydoc exists and local storage is synced
    // Cloud sync happens in the background and will merge data when it arrives
    const isCloudReady = connectionStatus === "connected";
    const isReady = ydoc !== null && isLocalReady;

    return {
        ydoc,
        provider,
        isLocalReady,
        isCloudReady,
        isCloudSynced,
        isReady,
        connectionStatus,
        users,
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
        isProjectUnavailable,
        isStaleClient,
        migrationOutcome,
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
