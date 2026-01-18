"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { removeAwarenessStates } from "y-protocols/awareness";
import { getRandomColor } from "@src/lib/utils/misc";
import { ThrottledWebsocketProvider } from "../collaboration/utils";
import { getCloudToken } from "../utils/requests";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { ScreenplaySchema } from "../screenplay/editor";
import { JSONContent } from "@tiptap/react";
import { Screenplay } from "../utils/types";
import { PageFormat } from "../utils/enums";

// Re-export repository for convenient access
export { ProjectRepository, createProjectRepository } from "./project-repository";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ProjectYjsState {
    ydoc: ProjectState | null;
    provider: ThrottledWebsocketProvider | null;
    isLocalReady: boolean;
    isCloudReady: boolean;
    connectionStatus: ConnectionStatus;
    users: CollaboratorInfo[];
    isLockedByServer: boolean;
    isSessionReplaced: boolean;
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
};

export type LayoutData = {
    pageSize: PageFormat;
    displaySceneNumbers: boolean;
};

export type ProjectData = {
    screenplay: JSONContent[];
    characters: any;
    scenes: any;
    cards: any;
    locations: any;
    metadata: ProjectMetadata;
    board: any;
    layout: LayoutData;
};

export class ProjectState extends Y.Doc {
    KEYS = {
        SCREENPLAY: "screenplay",
        CHARACTERS: "characters",
        SCENES: "scenes",
        CARDS: "cards",
        LOCATIONS: "locations",
        METADATA: "metadata",
        BOARD: "board",
        LAYOUT: "layout",
    } as const;

    metadata(): Y.Map<any> {
        return this.getMap(this.KEYS.METADATA);
    }
    screenplay(): Screenplay {
        const fragment = this.getXmlFragment(this.KEYS.SCREENPLAY);
        const screenplay = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
        const json = screenplay.toJSON().content ?? [];
        return json;
    }
    screenplayFragment(): Y.XmlFragment {
        return this.getXmlFragment(this.KEYS.SCREENPLAY);
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
//          PROJECT LOCK            //
// -------------------------------- //

/**
 * Hook to prevent the same user from opening the same project in multiple tabs.
 * Uses BroadcastChannel API to communicate between tabs.
 */
export const useProjectLock = (projectId: string | null) => {
    const [isLocked, setIsLocked] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const isOwnerRef = useRef(false);
    const isLockedRef = useRef(false);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") {
            setIsChecking(false);
            return;
        }

        const channelName = `scriptio-project-lock-${projectId}`;
        const channel = new BroadcastChannel(channelName);
        channelRef.current = channel;

        let checkTimeout: NodeJS.Timeout;

        // Handle messages from other tabs
        channel.onmessage = (event) => {
            if (event.data.type === "lock-check") {
                // Another tab is checking if the project is open
                // If we own the lock, respond that it's taken
                if (isOwnerRef.current) {
                    channel.postMessage({ type: "lock-taken" });
                }
            } else if (event.data.type === "lock-taken") {
                // Another tab already has this project open
                isLockedRef.current = true;
                setIsLocked(true);
                setIsChecking(false);
                isOwnerRef.current = false;
            } else if (event.data.type === "lock-released") {
                // The other tab released the lock, we can try to acquire it
                // But for simplicity, user should manually refresh
            }
        };

        // Check if another tab has the project open
        channel.postMessage({ type: "lock-check" });

        // Wait a short time for responses, then claim the lock if no response
        checkTimeout = setTimeout(() => {
            if (!isOwnerRef.current && !isLockedRef.current) {
                isOwnerRef.current = true;
                setIsChecking(false);
            }
        }, 100);

        // Cleanup: release lock when tab closes
        const handleUnload = () => {
            if (isOwnerRef.current) {
                channel.postMessage({ type: "lock-released" });
            }
        };

        window.addEventListener("beforeunload", handleUnload);

        return () => {
            clearTimeout(checkTimeout);
            window.removeEventListener("beforeunload", handleUnload);
            if (isOwnerRef.current) {
                channel.postMessage({ type: "lock-released" });
            }
            channel.close();
            channelRef.current = null;
            isOwnerRef.current = false;
            isLockedRef.current = false;
        };
    }, [projectId]);

    return { isLocked, isChecking };
};

// -------------------------------- //
//          LOCAL PERSISTENCE       //
// -------------------------------- //

/**
 * Hook to initialize local IndexedDB persistence for the Yjs document.
 */
export const useLocalPersistence = (projectId: string | null) => {
    const [ydoc, setYdoc] = useState<ProjectState | null>(null);
    const [isLocalReady, setIsLocalReady] = useState(false);
    const persistenceRef = useRef<IndexeddbPersistence | null>(null);

    useEffect(() => {
        if (!projectId) {
            setYdoc(null);
            setIsLocalReady(false);
            return;
        }

        // Create new Yjs document
        const doc = new ProjectState();

        // FIXED: Added missing parenthesis
        const localProvider = new IndexeddbPersistence(`scriptio-${projectId}`, doc);

        localProvider.on("synced", () => {
            console.log("[ProjectYjs] Local IndexedDB synced");
            setIsLocalReady(true);
        });

        persistenceRef.current = localProvider;
        setYdoc(doc);

        return () => {
            console.log("[ProjectYjs] Cleaning up local persistence");
            localProvider.destroy();
            doc.destroy();
            persistenceRef.current = null;
            setYdoc(null);
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
export const useCloudSync = (projectId: string | null, ydoc: Y.Doc | null, userInfo: UserInfo) => {
    const [provider, setProvider] = useState<ThrottledWebsocketProvider | null>(null);
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [isLockedByServer, setIsLockedByServer] = useState(false);
    const [isSessionReplaced, setIsSessionReplaced] = useState(false);

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
            const token = await getCloudToken(projectId);
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

        if (!ydoc || !projectId) {
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
                const token = await getCloudToken(projectId);
                if (!token || !isMountedRef.current) {
                    setConnectionStatus("disconnected");
                    return;
                }

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
                    }
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
                    if (isMountedRef.current) {
                        // Use setTimeout to avoid state update during render
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                setConnectionStatus(e.status as ConnectionStatus);
                            }
                        }, 0);
                    }
                });

                // Handle session replacement (same user connected from another tab/device)
                /*cloudProvider.on("session-replaced", () => {
                    console.log("[ProjectYjs] Session was replaced by another connection");
                    if (isMountedRef.current) {
                        setIsSessionReplaced(true);
                    }
                });*/

                providerRef.current = cloudProvider;
                setProvider(cloudProvider);
            } catch (e) {
                console.error("[ProjectYjs] Failed to initialize provider:", e);
                if (isMountedRef.current) {
                    setConnectionStatus("disconnected");
                }
            }
        };

        initializeProvider();

        const handleUnload = () => {
            if (providerRef.current && ydoc) {
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
                    removeAwarenessStates(providerRef.current.awareness, [ydoc.clientID], "component unmount");
                }
                providerRef.current.destroy();
                providerRef.current = null;
                setProvider(null);
            }
        };
    }, [ydoc]);

    return { provider, users, connectionStatus, refreshAndReconnect, isLockedByServer, isSessionReplaced };
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
        [userName, userColor]
    );

    const { ydoc, isLocalReady } = useLocalPersistence(projectId);
    const { provider, users, connectionStatus, refreshAndReconnect, isLockedByServer, isSessionReplaced } =
        useCloudSync(projectId, ydoc, userInfo);
    const isReady = isLocalReady && ydoc !== null;
    const isCloudReady = connectionStatus === "connected";

    return {
        ydoc,
        provider,
        isLocalReady,
        isCloudReady,
        isReady,
        connectionStatus,
        users,
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
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
