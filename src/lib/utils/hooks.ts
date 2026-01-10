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

const useProjectMemberships = () => {
    const { data, isLoading, mutate } = useSWR<ProjectMembershipPayload[]>("/api/projects");
    return {
        projects: data || [],
        isLoading,
        mutate,
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
};
