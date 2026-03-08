"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRandomColor } from "@src/lib/utils/misc";
import { getCloudToken } from "../utils/requests";
import { JSONContent } from "@tiptap/react";
import { Screenplay } from "../utils/types";
import { PageFormat } from "../utils/enums";

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

// Import types only (these don't cause SSR issues)
import * as Y from "yjs";
import type { ThrottledWebsocketProvider } from "../collaboration/utils";
import { ScreenplaySchema } from "../screenplay/editor";
import { TitlePageSchema } from "../titlepage/editor";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";

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
    clientId?: number;
}

export interface UserInfo {
    name: string;
    color: string;
}

export type ProjectMetadata = {
    version: number;
    id: string;
    title: string;
    author: string;
};

export type ElementMargin = { left: number; right: number }; // values in inches

/** Default margins per screenplay element (total from page edge, in inches). */
export const DEFAULT_ELEMENT_MARGINS: Record<string, ElementMargin> = {
    action: { left: 1.5, right: 1.0 },
    scene: { left: 1.5, right: 1.0 },
    character: { left: 4.0, right: 1.0 },
    dialogue: { left: 2.8, right: 2.0 },
    parenthetical: { left: 3.5, right: 3.0 },
    transition: { left: 1.5, right: 1.0 },
    section: { left: 1.5, right: 1.0 },
};

export type ElementStyle = { bold?: boolean; italic?: boolean; underline?: boolean; align?: "left" | "center" | "right" };

/** Default styling per screenplay element */
export const DEFAULT_ELEMENT_STYLES: Record<string, ElementStyle> = {
    action: { align: "left" },
    scene: { bold: true, align: "left" },
    character: { align: "left" },
    dialogue: { align: "left" },
    parenthetical: { align: "left" },
    transition: { align: "right" },
    section: { align: "center", underline: true },
};

export type LayoutData = {
    pageSize: PageFormat;
    displaySceneNumbers: boolean;
    sceneHeadingSpacing: number;
    sceneNumberOnRight: boolean;
    contdLabel: string;
    moreLabel: string;
    elementMargins: Record<string, ElementMargin>;
    elementStyles: Record<string, ElementStyle>;
};

export type ProjectData = {
    screenplay: JSONContent[];
    titlepage?: JSONContent[];
    characters: any;
    scenes: any;
    cards: any;
    locations: any;
    metadata: ProjectMetadata;
    board: any;
    layout: LayoutData;
};

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
        CARDS: "cards",
        LOCATIONS: "locations",
        METADATA: "metadata",
        BOARD: "board",
        LAYOUT: "layout",
        COMMENTS: "comments",
    } as const;

    metadata(): Y.Map<any> {
        return this.getMap(this.KEYS.METADATA);
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

    characters(): Y.Map<any> {
        return this.getMap(this.KEYS.CHARACTERS);
    }

    locations(): Y.Map<any> {
        return this.getMap(this.KEYS.LOCATIONS);
    }

    scenes(): Y.Map<any> {
        return this.getMap(this.KEYS.SCENES);
    }

    cards(): Y.Map<any> {
        return this.getMap(this.KEYS.CARDS);
    }

    board(): Y.Map<any> {
        return this.getMap(this.KEYS.BOARD);
    }

    layout(): Y.Map<any> {
        return this.getMap(this.KEYS.LAYOUT);
    }

    comments(): Y.Map<any> {
        return this.getMap(this.KEYS.COMMENTS);
    }
}

// -------------------------------- //
//       HELPER FUNCTIONS           //
// -------------------------------- //

/**
 * Get the characters Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getCharactersMap = (ydoc: ProjectState): Y.Map<any> => {
    return ydoc.characters();
};

/**
 * Get the locations Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getLocationsMap = (ydoc: ProjectState): Y.Map<any> => {
    return ydoc.locations();
};

/**
 * Get the scenes Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getScenesMap = (ydoc: ProjectState): Y.Map<any> => {
    return ydoc.scenes();
};

/**
 * Get the board Y.Map from a ProjectState.
 * Convenience function for direct access without repository.
 */
export const getBoardMap = (ydoc: ProjectState): Y.Map<any> => {
    return ydoc.board();
};

// -------------------------------- //
//          LOCAL PERSISTENCE       //
// -------------------------------- //

// Type for persistence providers (both IndexedDB and SQLite implement this interface)
interface PersistenceProvider {
    on(event: "synced", callback: (provider: any) => void): void;
    destroy(): void;
}

/**
 * Hook to initialize local persistence for the Yjs document.
 * Uses SQLite on desktop (Tauri) and IndexedDB on browser.
 */
export const useLocalPersistence = (projectId: string | null) => {
    const [ydoc, setYdoc] = useState<ProjectState | null>(null);
    const [isLocalReady, setIsLocalReady] = useState(false);
    const persistenceRef = useRef<PersistenceProvider | null>(null);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") {
            setYdoc(null);
            setIsLocalReady(false);
            return;
        }

        let isDestroyed = false;

        const initPersistence = async () => {
            // Dynamically import Yjs modules
            const Y = await getYjs();

            // Create new Yjs document
            const state = new ProjectState();

            let localProvider: PersistenceProvider;

            // Dynamically import isTauri to check environment
            const { isTauri } = await import("@tauri-apps/api/core");

            if (isTauri()) {
                // Desktop: Use SQLite persistence
                console.log("[ProjectYjs] Using SQLite persistence (desktop)");
                const { SqlitePersistence } = await import("../persistence/sqlite-persistence");
                localProvider = new SqlitePersistence(projectId, state);
            } else {
                // Browser: Use IndexedDB persistence
                console.log("[ProjectYjs] Using IndexedDB persistence (browser)");
                const { IndexeddbPersistence } = await import("y-indexeddb");
                localProvider = new IndexeddbPersistence(`scriptio-${projectId}`, state);
            }

            localProvider.on("synced", () => {
                if (isDestroyed) return;
                console.log("[ProjectYjs] Local storage synced");
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
            console.log("[ProjectYjs] Cleaning up local persistence");
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
        console.log("[ProjectYjs] refreshAndReconnect called");
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

        const initializeProvider = async () => {
            console.log("[ProjectYjs] Initializing cloud provider...");
            setConnectionStatus("connecting");

            try {
                // Check if we're in Tauri environment first
                const { isTauri } = await import("@tauri-apps/api/core");
                const isDesktop = isTauri();

                // Local-only projects (not cloud-synced) don't need cloud sync
                if (isDesktop) {
                    const { isLocalOnlyProject } = await import("../persistence/local-projects");
                    if (await isLocalOnlyProject(projectId)) {
                        console.log("[ProjectYjs] Local-only project - skipping cloud sync");
                        setConnectionStatus("disconnected");
                        setIsCloudSynced(true);
                        return;
                    }
                }

                const { token, status } = await getCloudToken(projectId);
                if (!token || !isMountedRef.current) {
                    console.log("[ProjectYjs] No auth token - skipping cloud sync (status:", status, ")");
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
                        // Disable BroadcastChannel in Tauri - it can interfere with sync
                        // See: https://github.com/tauri-apps/tauri/issues/10226
                        disableBc: isDesktop,
                    },
                );

                // Track connected users - only update state if users actually changed
                cloudProvider.awareness.on("update", () => {
                    if (!isMountedRef.current) return;

                    const connectedUsers = Array.from(cloudProvider.awareness.getStates().values())
                        .filter((state: any) => state.user)
                        .map((state: any) => state.user as CollaboratorInfo);

                    // Only update if users changed to avoid unnecessary re-renders
                    const usersJson = JSON.stringify(connectedUsers);
                    if (usersJson !== lastUsersJsonRef.current) {
                        lastUsersJsonRef.current = usersJson;
                        setUsers(connectedUsers);
                    }
                });

                // Handle connection errors
                cloudProvider.on("connection-error", async () => {
                    // Don't try to reconnect if session was replaced
                    if (cloudProvider.wasSessionReplaced) {
                        console.log("[ProjectYjs] Connection error ignored - session was replaced");
                        return;
                    }

                    console.warn("[ProjectYjs] Connection error, attempting to refresh token...");
                    if (isMountedRef.current) {
                        setConnectionStatus("connecting");
                        // Refresh the token before reconnecting
                        if (refreshAndReconnectRef.current) {
                            await refreshAndReconnectRef.current();
                        } else {
                            cloudProvider.scheduleReconnect();
                        }
                    }
                });

                // Status updates
                cloudProvider.on("status", (e: { status: string }) => {
                    console.log("[ProjectYjs] Connection status:", e.status);
                    console.log(
                        "isMountedRef.current: ",
                        isMountedRef.current,
                        " cloudProvider.synced: ",
                        cloudProvider.synced,
                    );
                    if (isMountedRef.current) {
                        // Use setTimeout to avoid state update during render
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                setConnectionStatus(e.status as ConnectionStatus);
                                // Check synced status when connected (might have synced already)
                                if (e.status === "connected" && cloudProvider.synced) {
                                    console.log("[ProjectYjs] Already synced on connect");
                                    setIsCloudSynced(true);
                                }
                            }
                        }, 0);
                    }
                });

                // Track when initial cloud sync completes
                // This is crucial for desktop clients where local IndexedDB may be empty
                // y-websocket sets .synced property when sync step 2 is complete
                cloudProvider.on("sync", (isSynced: boolean) => {
                    console.log("[ProjectYjs] Cloud sync event:", isSynced);
                    if (isMountedRef.current && isSynced) {
                        setIsCloudSynced(true);
                    }
                });

                // Poll for synced status since the event might fire before listener is attached
                // This is a safety net for race conditions
                const checkSynced = () => {
                    if (!isMountedRef.current) return;
                    if (cloudProvider.synced) {
                        console.log("[ProjectYjs] Provider synced (poll check)");
                        setIsCloudSynced(true);
                    } else {
                        // Check again after a short delay
                        setTimeout(checkSynced, 100);
                    }
                };
                // Start checking after connection is established
                setTimeout(checkSynced, 50);

                providerRef.current = cloudProvider;
                setProvider(cloudProvider);
            } catch (e) {
                console.error("[ProjectYjs] Failed to initialize provider:", e);
                if (isMountedRef.current) {
                    setConnectionStatus("disconnected");
                    // Allow proceeding with local data when cloud sync fails
                    setIsCloudSynced(true);
                }
            }
        };

        initializeProvider();

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
                console.log("[ProjectYjs] Destroying cloud provider...");
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
}

export const useProjectYjs = ({
    projectId,
    userName,
    userColor,
}: UseProjectYjsOptions): ProjectYjsState & {
    isReady: boolean;
    refreshAndReconnect: () => Promise<void>;
} => {
    const userInfo = useMemo<UserInfo>(
        () => ({
            name: userName || `User_${Math.floor(Math.random() * 1000)}`,
            color: userColor || getRandomColor(),
        }),
        [userName, userColor],
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
