"use client";

import useSWR from "swr";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CookieUser, UserSettings } from "./types";
import { ProjectContext } from "@src/context/ProjectContext";
import { Page } from "./enums";
import { ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { KeyBindingMap, tinykeys } from "tinykeys";
import { DEFAULT_KEYBINDS, executeKeybindAction, KeybindId } from "./keybinds";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ProjectRole } from "@prisma/client";

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
        [position]
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
    const params = useParams();
    const [projectId, setProjectId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (params.projectId) setProjectId(params.projectId as string);
    }, [params]);

    return projectId;
};

const useUser = () => {
    const { data: user, isLoading, mutate } = useSWR("/api/users");
    return { user, isLoading, mutate };
};

const useCookieUser = (redirect: boolean = false) => {
    const { data: user, isLoading } = useSWR<CookieUser>("/api/users/cookie");
    const router = useRouter();

    if (redirect && !isLoading && !user) {
        router.push("/login");
    }

    return { user, isLoading };
};

const useSettings = () => {
    const { data: settings, isLoading, mutate } = useSWR<UserSettings>("/api/users/settings");

    return {
        settings,
        isLoading,
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
    const isDesktop = useDesktop();

    const refresh = useCallback(async () => {
        if (!isDesktop) {
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
    }, [isDesktop]);

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
    const isDesktop = useDesktop();
    const { data: remoteProjects, isLoading: isRemoteLoading, mutate } = useSWR<ProjectMembershipPayload[]>(
        // On desktop without auth, don't fetch remote - it will fail
        // The fetcher will handle auth errors gracefully
        "/api/projects"
    );
    const { localProjects, isLoading: isLocalLoading, refresh: refreshLocal } = useLocalProjects();

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
    const isLoading = isDesktop
        ? isLocalLoading || (isRemoteLoading && localProjects.length === 0)
        : isRemoteLoading;

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
        projectId ? `/api/projects/${projectId}` : null
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
            setPage(Page.Index);
            return;
        }

        const lastSegment = segments[segments.length - 1];
        if (Object.values(Page).includes(lastSegment as Page)) {
            setPage(lastSegment as Page);
        } else {
            setPage(Page.Index);
        }
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
    context: { toggleFocusMode: () => void; saveProject: () => void }
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
};
