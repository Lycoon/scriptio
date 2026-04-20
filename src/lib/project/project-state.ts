"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRandomColor } from "@src/lib/utils/misc";
import { getCloudToken } from "../utils/requests";
import { JSONContent } from "@tiptap/react";
import { Screenplay } from "../utils/types";
import { PageFormat } from "../utils/enums";
import * as Y from "yjs";
import type { ThrottledWebsocketProvider } from "../collaboration/utils";
import { ScreenplaySchema } from "../screenplay/editor";
import { TitlePageSchema } from "../titlepage/editor";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { CharacterItem, CharacterMap } from "../screenplay/characters";
import type { LocationItem, LocationMap } from "../screenplay/locations";
import type { PersistentScene, PersistentSceneMap } from "../screenplay/scenes";
import type { Comment } from "../utils/types";
import type { YjsLocalProvider } from "../persistence/y-local-provider";

// Lazy re-export repository for convenient access (avoid loading yjs at module level)
export const getProjectRepository = async () => {
    const module = await import("./project-repository");
    return {
        ProjectRepository: module.ProjectRepository,
        createProjectRepository: module.createProjectRepository,
    };
};

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

// ---- Shelf types ----

export type ShelfEntryType = "scene" | "character" | "action";

export type ShelfVersionMeta = {
    id: string; // unique version ID (nanoid)
    title: string; // default: today's date on creation
};

export type ShelfEntry = {
    title: string; // text content of the shelved node
    type: ShelfEntryType;
    versions: ShelfVersionMeta[];
};

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

export type ProjectMetadata = {
    version: number;
    id: string;
    title: string;
    author: string;
    titlepageInitialized?: boolean;
};

export type ElementMargin = { left: number; right: number }; // values in inches (offset from page margin)

export type PageMargin = { top: number; bottom: number; left: number; right: number }; // values in inches

/** Default page margins (in inches). */
export const DEFAULT_PAGE_MARGINS: PageMargin = {
    top: 1.0,
    bottom: 1.0,
    left: 1.5,
    right: 1.0,
};

/** Default margins per screenplay element (offset from page margin, in inches). */
export const DEFAULT_ELEMENT_MARGINS: Record<string, ElementMargin> = {
    action: { left: 0, right: 0 },
    scene: { left: 0, right: 0 },
    character: { left: 2.5, right: 0 },
    dialogue: { left: 1.3, right: 1.0 },
    parenthetical: { left: 2.0, right: 2.0 },
    transition: { left: 0, right: 0 },
    section: { left: 0, right: 0 },
};

export type ElementStyle = {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    uppercase?: boolean;
    align?: "left" | "center" | "right";
    startNewPage?: boolean;
};

/** Default styling per screenplay element */
export const DEFAULT_ELEMENT_STYLES: Record<string, ElementStyle> = {
    action: { align: "left" },
    scene: { bold: true, align: "left", uppercase: true },
    character: { align: "left", uppercase: true },
    dialogue: { align: "left" },
    parenthetical: { align: "left" },
    transition: { align: "right", uppercase: true },
    section: { align: "center", underline: true, startNewPage: true, uppercase: true },
};

export type LayoutData = {
    pageSize: PageFormat;
    pageMargins: PageMargin;
    displaySceneNumbers: boolean;
    sceneHeadingSpacing: number;
    sceneNumberOnRight: boolean;
    contdLabel: string;
    moreLabel: string;
    elementMargins: Record<string, ElementMargin>;
    elementStyles: Record<string, ElementStyle>;
};

export interface BoardCardData {
    id: string;
    title: string;
    description: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BoardArrowData {
    id: string;
    fromCardId: string;
    toCardId: string;
}

export type BoardData = {
    cards: string; // JSON string of BoardCardData[]
    arrows: string; // JSON string of BoardArrowData[]
};

export type ProjectData = {
    screenplay: JSONContent[];
    titlepage?: JSONContent[];
    characters: CharacterMap;
    scenes: PersistentSceneMap;
    locations: LocationMap;
    metadata: ProjectMetadata;
    board: BoardData;
    layout: LayoutData;
    comments?: Record<string, Comment>;
    shelf?: Record<string, ShelfEntry>;
};

/**
 * Helper to provide stronger typing for Y.Map where different keys have different types.
 * This avoids manual casts when accessing known keys.
 */
export interface TypedMap<T extends Record<string, unknown>> extends Omit<Y.Map<T[keyof T]>, "get" | "set" | "toJSON"> {
    get<K extends keyof T>(key: K): T[K] | undefined;
    set<K extends keyof T>(key: K, value: T[K]): T[K];
    toJSON(): T;
}

// -------------------------------- //
//       LAZY-LOADED MODULES        //
// -------------------------------- //

// Cache for dynamically imported modules to avoid multiple imports
let yjsModule: typeof import("yjs") | null = null;
let yProtocolsModule: typeof import("y-protocols/awareness") | null = null;
let yProsemirrorModule: typeof import("y-prosemirror") | null = null;
let screenplayEditorModule: typeof import("../screenplay/editor") | null = null;

async function getYjs() {
    if (!yjsModule) {
        yjsModule = await import("yjs");
    }
    return yjsModule;
}

async function getYProtocols() {
    if (!yProtocolsModule) {
        yProtocolsModule = await import("y-protocols/awareness");
    }
    return yProtocolsModule;
}

async function getYProsemirror() {
    if (!yProsemirrorModule) {
        yProsemirrorModule = await import("y-prosemirror");
    }
    return yProsemirrorModule;
}

async function getScreenplayEditor() {
    if (!screenplayEditorModule) {
        screenplayEditorModule = await import("../screenplay/editor");
    }
    return screenplayEditorModule;
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
//          PROJECT STATE           //
// -------------------------------- //

// ProjectState class - created dynamically to avoid SSR issues
export class ProjectState extends Y.Doc {
    KEYS = {
        SCREENPLAY: "screenplay",
        TITLEPAGE: "titlepage",
        CHARACTERS: "characters",
        SCENES: "scenes",
        LOCATIONS: "locations",
        METADATA: "metadata",
        BOARD: "board",
        LAYOUT: "layout",
        COMMENTS: "comments",
        DICTIONARY: "dictionary",
        SHELF: "shelf",
    } as const;

    metadata(): TypedMap<ProjectMetadata> {
        return this.getMap(this.KEYS.METADATA) as unknown as TypedMap<ProjectMetadata>;
    }

    screenplay(): Screenplay {
        const fragment = this.screenplayFragment();
        const proseMirrorNode = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
        return proseMirrorNode.content.toJSON() as Screenplay;
    }

    screenplayFragment(): Y.XmlFragment {
        return this.getXmlFragment(this.KEYS.SCREENPLAY);
    }

    titlepage(): JSONContent[] {
        const fragment = this.titlepageFragment();
        const proseMirrorNode = yXmlFragmentToProseMirrorRootNode(fragment, TitlePageSchema);
        return proseMirrorNode.content.toJSON() as JSONContent[];
    }

    titlepageFragment(): Y.XmlFragment {
        return this.getXmlFragment(this.KEYS.TITLEPAGE);
    }

    characters(): Y.Map<CharacterItem> {
        return this.getMap(this.KEYS.CHARACTERS);
    }

    locations(): Y.Map<LocationItem> {
        return this.getMap(this.KEYS.LOCATIONS);
    }

    scenes(): Y.Map<PersistentScene> {
        return this.getMap(this.KEYS.SCENES);
    }

    board(): TypedMap<BoardData> {
        return this.getMap(this.KEYS.BOARD) as unknown as TypedMap<BoardData>;
    }

    layout(): TypedMap<LayoutData> {
        return this.getMap(this.KEYS.LAYOUT) as unknown as TypedMap<LayoutData>;
    }

    comments(): Y.Map<Comment> {
        return this.getMap(this.KEYS.COMMENTS);
    }

    /** Per-project custom dictionary words (keys are words, values are true). */
    dictionary(): Y.Map<boolean> {
        return this.getMap(this.KEYS.DICTIONARY);
    }

    /** Shelf entries keyed by node UUID. */
    shelf(): Y.Map<ShelfEntry> {
        return this.getMap(this.KEYS.SHELF);
    }

    /** Get the Y.XmlFragment for a specific shelf version's content. */
    shelfFragment(nodeId: string, versionId: string): Y.XmlFragment {
        return this.getXmlFragment(`shelf_${nodeId}_${versionId}`);
    }
}

// -------------------------------- //
//       HELPER FUNCTIONS           //
// -------------------------------- //

/**
 * Get the characters Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getCharactersMap = (ydoc: ProjectState): Y.Map<CharacterItem> => {
    return ydoc.characters();
};

/**
 * Get the locations Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getLocationsMap = (ydoc: ProjectState): Y.Map<LocationItem> => {
    return ydoc.locations();
};

/**
 * Get the scenes Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getScenesMap = (ydoc: ProjectState): Y.Map<PersistentScene> => {
    return ydoc.scenes();
};

/**
 * Get the board Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getBoardMap = (ydoc: ProjectState): TypedMap<BoardData> => {
    return ydoc.board();
};

// -------------------------------- //
//          LOCAL PERSISTENCE       //
// -------------------------------- //

/**
 * Hook to initialize local persistence for the Yjs document.
 * Uses SQLite on desktop (Tauri) and IndexedDB on browser.
 */
export const useLocalPersistence = (projectId: string | null) => {
    const [ydoc, setYdoc] = useState<ProjectState | null>(null);
    const [isLocalReady, setIsLocalReady] = useState(false);
    const persistenceRef = useRef<YjsLocalProvider | null>(null);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") {
            setYdoc(null);
            setIsLocalReady(false);
            return;
        }

        let isDestroyed = false;
        const initPersistence = async () => {
            const state = new ProjectState();
            const { createLocalYjsProvider } = await import("../persistence/y-local-provider");
            const localProvider = await createLocalYjsProvider(projectId, state);

            localProvider.on("synced", () => {
                if (isDestroyed) return;
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
        };
    }, [projectId]);

    return { ydoc, isLocalReady };
};

// -------------------------------- //
//          CLOUD SYNC              //
// -------------------------------- //

/**
 * Hook to manage cloud WebSocket synchronization.
 */
export const useCloudSync = (projectId: string | null, ydoc: ProjectState | null, userInfo: UserInfo) => {
    const [provider, setProvider] = useState<ThrottledWebsocketProvider | null>(null);
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [isCloudSynced, setIsCloudSynced] = useState(false);
    const [isLockedByServer, setIsLockedByServer] = useState(false);
    const [isSessionReplaced, setIsSessionReplaced] = useState(false);
    const [isProjectUnavailable, setIsProjectUnavailable] = useState(false);

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
                const { isLocalOnlyProject } = await import("../persistence/storage-provider/local-persistence");
                if (await isLocalOnlyProject(projectId)) {
                    setConnectionStatus("disconnected");
                    setIsCloudSynced(true);
                    return;
                }

                const { token, status } = await getCloudToken(projectId);
                if (!token || !isMountedRef.current) {
                    setConnectionStatus("disconnected");
                    setIsCloudSynced(true); // Mark as "synced" so isReady becomes true

                    // On desktop, 403 means the cloud project was deleted or user was removed
                    if (status === 403 && isDesktop) {
                        setIsProjectUnavailable(true);
                    }
                    return;
                }

                // Dynamically import collaboration utils
                const { ThrottledWebsocketProvider } = await import("../collaboration/utils");

                const cloudProvider = new ThrottledWebsocketProvider(
                    `${process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL}`,
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
                    console.log("[ProjectYjs] Document restored — clearing local cache and reloading");
                    await clearLocalProjectCache(projectId);
                    window.location.reload();
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
                removeAwarenessStates(providerRef.current.awareness, [ydoc.clientID], "window unload");
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
                            removeAwarenessStates(providerRef.current.awareness, [ydoc.clientID], "component unmount");
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
    const userInfo = useMemo<UserInfo>(
        () => ({
            name: userName || `User_${Math.floor(Math.random() * 1000)}`,
            color: userColor || getRandomColor(),
            userId,
        }),
        [userName, userColor, userId],
    );

    const { ydoc, isLocalReady } = useLocalPersistence(projectId);
    const {
        provider,
        users,
        connectionStatus,
        isCloudSynced,
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
        isProjectUnavailable,
    } = useCloudSync(projectId, ydoc, userInfo);

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
    };
};

// -------------------------------- //
//          UTILITY HOOKS           //
// -------------------------------- //

/**
 * Hook to observe a Y.Map and re-render on changes
 */
export const useYMap = <T>(ymap: Y.Map<T> | null): Map<string, T> => {
    const [state, setState] = useState<Map<string, T>>(new Map());

    useEffect(() => {
        if (!ymap) {
            setState(new Map());
            return;
        }

        // Initial state
        const initialState = new Map<string, T>();
        ymap.forEach((value, key) => {
            initialState.set(key, value);
        });
        setState(initialState);

        // Observe changes
        const observer = () => {
            const newState = new Map<string, T>();
            ymap.forEach((value, key) => {
                newState.set(key, value);
            });
            setState(newState);
        };

        ymap.observe(observer);

        return () => {
            ymap.unobserve(observer);
        };
    }, [ymap]);

    return state;
};

/**
 * Hook to observe a Y.Array and re-render on changes
 */
export const useYArray = <T>(yarray: Y.Array<T> | null): T[] => {
    const [state, setState] = useState<T[]>([]);

    useEffect(() => {
        if (!yarray) {
            setState([]);
            return;
        }

        // Initial state
        setState(yarray.toArray());

        // Observe changes
        const observer = () => {
            setState(yarray.toArray());
        };

        yarray.observe(observer);

        return () => {
            yarray.unobserve(observer);
        };
    }, [yarray]);

    return state;
};
