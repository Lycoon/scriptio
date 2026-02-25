"use client";

import useSWR from "swr";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CookieUser, UserSettings } from "./types";
import { ProjectContext } from "@src/context/ProjectContext";
import { isPage, Page } from "./enums";
import { ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { KeyBindingMap, tinykeys } from "tinykeys";
import { DEFAULT_KEYBINDS, executeKeybindAction, KeybindId } from "./keybinds";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProjectRole } from "@prisma/client";
import { isTauri } from "@tauri-apps/api/core";

interface Position {
    x: number;
    y: number;
}

interface UseDraggableReturn {
    position: Position;
    handleMouseDown: (e: React.MouseEvent) => void;
    isDragging: boolean;
}

const useDraggable = (initialPosition?: Position): UseDraggableReturn => {
    const [position, setPosition] = useState<Position>(initialPosition || { x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<Position>({ x: 0, y: 0 });
    const positionStartRef = useRef<Position>({ x: 0, y: 0 });

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            positionStartRef.current = { ...position };
        },
        [position],
    );

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - dragStartRef.current.x;
            const deltaY = e.clientY - dragStartRef.current.y;
            setPosition({
                x: positionStartRef.current.x + deltaX,
                y: positionStartRef.current.y + deltaY,
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging]);

    return { position, handleMouseDown, isDragging };
};

const useDesktop = (): boolean => {
    const [isDesktop, setIsDesktop] = useState<boolean>(false);

    useEffect(() => {
        if (window.__TAURI__) setIsDesktop(true);
    }, []);

    return isDesktop;
};

interface StateResult<T> {
    data?: T;
    isLoading: boolean;
    error?: any;
    mutate?: (data?: T, shouldRevalidate?: boolean) => Promise<T | undefined>;
}

const useProjectIdFromUrl = () => {
    const searchParams = useSearchParams();
    const [projectId, setProjectId] = useState<string>("");

    useEffect(() => {
        const projectId = searchParams.get("projectId");
        if (projectId) setProjectId(projectId as string);
    }, [searchParams]);

    return projectId;
};

const useUser = () => {
    const { data: user, isLoading, mutate } = useSWR("/api/users");
    return { user, isLoading, mutate };
};

const useCookieUser = (redirect: boolean = false) => {
    const { data: user, isLoading, error } = useSWR<CookieUser>("/api/users/cookie");
    const [localUser, setLocalUser] = useState<CookieUser | undefined>(undefined);
    const router = useRouter();

    // On desktop, if the server is unreachable but we have a stored token,
    // decode the JWT locally to get user info for the UI.
    useEffect(() => {
        if (!isTauri() || user || isLoading || !error) return;

        const loadLocalUser = async () => {
            const { getDesktopUserFromToken } = await import("@src/lib/desktop-auth");
            const decoded = await getDesktopUserFromToken();
            if (decoded) setLocalUser(decoded);
        };
        loadLocalUser();
    }, [error, user, isLoading]);

    const effectiveUser = user || localUser;

    if (redirect && !isLoading && !effectiveUser) {
        router.push("/login");
    }

    return { user: effectiveUser, isLoading };
};

const useSettings = () => {
    const { user, isLoading: isUserLoading } = useCookieUser();
    const { data: settings, isLoading, mutate } = useSWR<UserSettings>(
        !isUserLoading && user ? "/api/users/settings" : null,
    );

    return {
        settings,
        isLoading: isUserLoading || isLoading,
        mutate,
    };
};

/**
 * Extended project membership type that includes sync status.
 */
export interface ExtendedProjectMembershipPayload extends ProjectMembershipPayload {
    isLocalOnly: boolean;
}

/**
 * Hook to fetch local projects from SQLite (desktop only).
 * Returns empty array on web.
 */
const useLocalProjects = () => {
    const [localProjects, setLocalProjects] = useState<ExtendedProjectMembershipPayload[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        // Use isTauri() directly for synchronous check (avoids timing issues with useDesktop hook)
        if (!isTauri()) {
            setLocalProjects([]);
            setIsLoading(false);
            return;
        }

        try {
            const { getLocalProjects } = await import("@src/lib/persistence/local-projects");
            const projects = await getLocalProjects();

            const memberships: ExtendedProjectMembershipPayload[] = projects.map((p) => ({
                role: ProjectRole.OWNER,
                isLocalOnly: true,
                project: {
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    author: p.author,
                    hasPoster: false,
                    poster: null,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                },
            }));

            setLocalProjects(memberships);
        } catch (error) {
            console.error("[useLocalProjects] Failed to load local projects:", error);
            setLocalProjects([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { localProjects, isLoading, refresh };
};

/**
 * Hook to fetch all projects (remote + local).
 * Remote projects are fetched via API, local projects from SQLite on desktop.
 */
const useProjectMemberships = () => {
    const {
        data: remoteProjects,
        isLoading: isRemoteLoading,
        mutate,
    } = useSWR<ProjectMembershipPayload[]>(
        // On desktop without auth, don't fetch remote - it will fail
        // The fetcher will handle auth errors gracefully
        "/api/projects",
    );
    const { localProjects, isLoading: isLocalLoading, refresh: refreshLocal } = useLocalProjects();

    // On desktop, ensure remote projects have local entries for offline persistence
    useEffect(() => {
        if (!isTauri() || !remoteProjects || remoteProjects.length === 0) return;

        const sync = async () => {
            const { ensureLocalEntries } = await import("@src/lib/persistence/local-projects");
            await ensureLocalEntries(
                remoteProjects.map((p) => ({
                    id: p.project.id,
                    title: p.project.title,
                    description: p.project.description,
                    createdAt: new Date(p.project.createdAt),
                    updatedAt: new Date(p.project.updatedAt),
                })),
            );
            await refreshLocal();
        };
        sync();
    }, [remoteProjects, refreshLocal]);

    // Merge remote and local projects, sorted by updatedAt
    const projects = useMemo(() => {
        const remote: ExtendedProjectMembershipPayload[] = (remoteProjects || []).map((p) => ({
            ...p,
            isLocalOnly: false,
        }));

        // Filter out local projects that might have been synced (same ID in remote)
        const remoteIds = new Set(remote.map((p) => p.project.id));
        const localOnly = localProjects.filter((p) => !remoteIds.has(p.project.id));

        // Combine and sort by updatedAt descending
        const combined = [...remote, ...localOnly];
        combined.sort((a, b) => {
            const dateA = new Date(a.project.updatedAt).getTime();
            const dateB = new Date(b.project.updatedAt).getTime();
            return dateB - dateA;
        });

        return combined;
    }, [remoteProjects, localProjects]);

    // Combined loading state - on desktop, wait for local to be ready
    // On web, only wait for remote
    const isLoading = isTauri() ? isLocalLoading || (isRemoteLoading && localProjects.length === 0) : isRemoteLoading;

    // Combined mutate function
    const refreshAll = useCallback(async () => {
        await Promise.all([mutate(), refreshLocal()]);
    }, [mutate, refreshLocal]);

    return {
        projects,
        isLoading,
        mutate: refreshAll,
        refreshLocal,
    };
};

const useProjectMembership = () => {
    const { updateProject } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();

    const { data, isLoading, mutate } = useSWR<ProjectMembershipPayload>(
        projectId ? `/api/projects/${projectId}` : null,
    );

    useEffect(() => {
        if (data && !isLoading) {
            updateProject(data);
        }
    }, [data]);

    return { membership: data, isLoading, mutate };
};

const useProjectInvites = (projectId: string | undefined) => {
    const { data, isLoading, mutate } = useSWR<ProjectInvite[]>(projectId ? `/api/projects/${projectId}/invite` : null);
    return { invites: data || [], isLoading, mutate };
};

const useProjectCollaborators = (projectId: string | undefined) => {
    const { data, isLoading, mutate } = useSWR<any[]>(projectId ? `/api/projects/${projectId}/members` : null);
    return { collaborators: data || [], isLoading, mutate };
};

const usePage = (): Page | undefined => {
    const pathname = usePathname();
    const [page, setPage] = useState<Page | undefined>(undefined);

    useEffect(() => {
        if (!pathname) return;

        const segments = pathname.split("/").filter(Boolean);
        if (segments.length === 0) {
            setPage("index");
            return;
        }

        const lastSegment = segments[segments.length - 1];
        if (isPage(lastSegment)) setPage(lastSegment as Page);
        else setPage("index");
    }, [pathname]);

    return page;
};

export const useEffectiveKeybinds = (userShortcuts: Record<string, string> | undefined) => {
    return useMemo(() => {
        const merged: Record<string, string> = {};
        (Object.keys(DEFAULT_KEYBINDS) as Array<KeybindId>).forEach((id) => {
            merged[id] = userShortcuts && userShortcuts[id] ? userShortcuts[id] : DEFAULT_KEYBINDS[id].defaultCombo;
        });
        return merged;
    }, [userShortcuts]);
};

export const useGlobalKeybinds = (
    userKeybinds: Record<string, string> | undefined,
    context: { toggleFocusMode: () => void; saveProject: () => void },
) => {
    const effectiveKeybinds = useEffectiveKeybinds(userKeybinds);

    useEffect(() => {
        const keyBindingMap: KeyBindingMap = {};

        Object.entries(DEFAULT_KEYBINDS).forEach(([id, def]) => {
            const keyId = id as KeybindId;
            if (def.scope !== "global") return;

            const combo = effectiveKeybinds[id];
            if (!combo) return;

            keyBindingMap[combo] = (event: KeyboardEvent) => {
                event.preventDefault();

                executeKeybindAction(keyId, {
                    editor: null,
                    toggleFocusMode: context.toggleFocusMode,
                    saveProject: context.saveProject,
                });
            };
        });

        return tinykeys(window, keyBindingMap);
    }, [effectiveKeybinds, context]);
};

/**
 * Hook to get local project info from SQLite (desktop only).
 * Used when on desktop without auth to get project metadata.
 */
const useLocalProjectInfo = (projectId: string | null) => {
    const [title, setTitle] = useState<string>("Untitled");
    const [description, setDescription] = useState<string | null>(null);
    const [author, setAuthor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!projectId || !isTauri()) {
            setIsLoading(false);
            return;
        }

        const loadLocalProject = async () => {
            try {
                const { getLocalProject } = await import("@src/lib/persistence/local-projects");
                const localProject = await getLocalProject(projectId);
                if (localProject) {
                    setTitle(localProject.title);
                    setDescription(localProject.description);
                    setAuthor(localProject.author);
                }
            } catch (error) {
                console.error("[useLocalProjectInfo] Failed to load local project:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadLocalProject();
    }, [projectId]);

    return { title, description, author, isLoading };
};

export {
    useDraggable,
    useUser,
    useCookieUser,
    useSettings,
    useProjectMemberships,
    useProjectMembership,
    useProjectInvites,
    useProjectCollaborators,
    usePage,
    useDesktop,
    useLocalProjects,
    useLocalProjectInfo,
    useProjectIdFromUrl,
};
