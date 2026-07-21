"use client";

import useSWR, { useSWRConfig } from "swr";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CookieUser, UserSettings } from "./types";
import { editUserSettings } from "./requests";
import { readLocalSettings, writeLocalSettings, DEFAULT_LOCAL_SETTINGS } from "./local-settings";
import { ProjectContext } from "@src/context/ProjectContext";
import { isPage, Page } from "./enums";
import { Collaborator, ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { KeyBindingMap, tinykeys } from "tinykeys";
import { DEFAULT_KEYBINDS, executeKeybindAction, KeybindId } from "./keybinds";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProjectRole } from "../../generated/client/browser";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslations } from "next-intl";

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
    const [isDesktop] = useState<boolean>(() => typeof window !== "undefined" && !!window.__TAURI__);
    return isDesktop;
};

// Phone breakpoint: below this the editor switches to the single-panel drawer
// layout. At or above it (iPad, resized desktop windows) the desktop layout is
// kept. Keep in sync with the @media (max-width: 767px) blocks in the CSS.
const PHONE_QUERY = "(max-width: 767px)";

/**
 * True on phone-sized viewports (< 768px). Drives the structural mobile forks
 * that CSS alone can't express — overlay-drawer sidebars, disabled split view,
 * the burger navbar. SSR-safe: starts false on the server and syncs on mount.
 */
const useIsPhone = (): boolean => {
    // Start `false` so the server render and the client's first (hydration) render
    // agree — reading window.matchMedia in the initializer would make the client's
    // first render disagree with the SSR HTML and throw a hydration mismatch. The
    // real value is resolved in the effect below, right after mount.
    const [isPhone, setIsPhone] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mql = window.matchMedia(PHONE_QUERY);
        const onChange = () => setIsPhone(mql.matches);
        onChange();
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    return isPhone;
};


const useProjectIdFromUrl = () => {
    const searchParams = useSearchParams();
    return searchParams.get("projectId") ?? "";
};

const useUser = () => {
    const { data: user, isLoading, mutate } = useSWR("/api/users");
    return { user, isLoading, mutate };
};

const useCookieUser = (redirect: boolean = false) => {
    const { data: user, isLoading, error } = useSWR<CookieUser>("/api/users/cookie");
    const [localUser, setLocalUser] = useState<CookieUser | undefined>(undefined);
    const router = useRouter();

    // On desktop, persist the user record alongside the token so the shell can
    // render while offline. NextAuth tokens are JWE-encrypted and cannot be
    // decoded client-side, so we cache the resolved user instead.
    useEffect(() => {
        if (!isTauri() || !user) return;
        (async () => {
            const { setCachedDesktopUser } = await import("@src/lib/desktop-auth");
            await setCachedDesktopUser({
                id: user.id,
                email: user.email,
                createdAt:
                    user.createdAt instanceof Date
                        ? user.createdAt.toISOString()
                        : (user.createdAt as unknown as string),
            });
        })();
    }, [user]);

    // Server unreachable on desktop — fall back to whatever we cached.
    useEffect(() => {
        if (!isTauri() || user || isLoading || !error) return;
        (async () => {
            const { getCachedDesktopUser } = await import("@src/lib/desktop-auth");
            const cached = await getCachedDesktopUser();
            if (cached) {
                setLocalUser({
                    id: cached.id,
                    email: cached.email,
                    createdAt: new Date(cached.createdAt),
                } as CookieUser);
            }
        })();
    }, [error, user, isLoading]);

    const effectiveUser = user || localUser;

    if (redirect && !isLoading && !effectiveUser) {
        router.push("/");
    }

    return { user: effectiveUser, isLoading };
};

const useSettings = () => {
    const { user, isLoading: isUserLoading } = useCookieUser();
    const isAuthenticated = !isUserLoading && !!user;

    // Remote settings for authenticated users
    const {
        data: remoteSettings,
        isLoading: isRemoteLoading,
        mutate: swrMutate,
    } = useSWR<UserSettings>(isAuthenticated ? "/api/users/settings" : null);

    // Local settings for unauthenticated users.
    // Using SWR with a fixed key so the cache is shared across all useSettings() callers —
    // a plain useState would be per-instance, meaning mutations in one component
    // would not propagate to others (e.g. AppearanceSettings → EditorThemeSync).
    const { data: localData, mutate: mutateLocal } = useSWR<UserSettings>(
        !isAuthenticated ? "local-settings" : null,
        readLocalSettings,
        { revalidateOnFocus: false },
    );

    const settings = isAuthenticated ? remoteSettings : (localData ?? DEFAULT_LOCAL_SETTINGS);

    const mutate = useCallback(
        (data?: UserSettings, revalidate?: boolean) => {
            if (!isAuthenticated) return mutateLocal(data, { revalidate });
            return swrMutate(data, { revalidate });
        },
        [isAuthenticated, mutateLocal, swrMutate],
    );

    const saveSettings = useCallback(
        async (updates: Partial<UserSettings>) => {
            // Use a functional update so we always merge with the *current* cache value,
            // not a stale closure copy — prevents rapid toggles from overwriting each other.
            mutateLocal((current) => ({ ...(current ?? DEFAULT_LOCAL_SETTINGS), ...updates }), false);
            await writeLocalSettings(updates);

            if (isAuthenticated) {
                await editUserSettings(updates);
            }
        },
        [isAuthenticated, mutateLocal],
    );

    return {
        settings,
        isLoading: isUserLoading || (isAuthenticated ? isRemoteLoading : false),
        mutate,
        saveSettings,
    };
};

/**
 * Extended project membership type that includes sync status.
 */
export interface ExtendedProjectMembershipPayload extends ProjectMembershipPayload {
    isLocalOnly: boolean;
}

/**
 * Hook to fetch cached projects from persistence (SQLite on desktop, IndexedDB on browser).
 */
const useCachedProjects = () => {
    const [cachedProjects, setCachedProjects] = useState<ExtendedProjectMembershipPayload[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const { getCachedProjects } = await import("@src/lib/persistence/storage-provider/local-persistence");
            const projects = await getCachedProjects();

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

            setCachedProjects(memberships);
        } catch (error) {
            console.error("[useCachedProjects] Failed to load cached projects:", error);
            setCachedProjects([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { cachedProjects, isLoading, refresh };
};

/**
 * Hook to fetch all projects (remote + local).
 * Remote projects are fetched via API, local projects from SQLite on desktop.
 */
const useProjectMemberships = () => {
    const { user, isLoading: isAuthLoading } = useCookieUser();
    const {
        data: remoteProjects,
        isLoading: isRemoteLoading,
        mutate,
    } = useSWR<ProjectMembershipPayload[]>(!isAuthLoading && user ? "/api/projects" : null);
    const { cachedProjects, isLoading: isLocalLoading, refresh: refreshLocal } = useCachedProjects();

    // Ensure remote projects have local entries for offline persistence
    useEffect(() => {
        if (!remoteProjects || remoteProjects.length === 0) return;

        const sync = async () => {
            const { ensureCachedEntries } = await import("@src/lib/persistence/storage-provider/local-persistence");
            await ensureCachedEntries(
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
        // Local edits bump only the cached copy's updatedAt (content lives in the
        // Yjs doc, not the Project row the API returns), so for a synced project take
        // whichever "last edited" is newer — otherwise editing a cloud project never
        // moves its date until the server row itself changes.
        const localById = new Map(cachedProjects.map((p) => [p.project.id, p]));
        const remote: ExtendedProjectMembershipPayload[] = (remoteProjects || []).map((p) => {
            const cached = localById.get(p.project.id);
            const cachedTime = cached ? new Date(cached.project.updatedAt).getTime() : 0;
            const remoteTime = new Date(p.project.updatedAt).getTime();
            return {
                ...p,
                isLocalOnly: false,
                project:
                    cachedTime > remoteTime
                        ? { ...p.project, updatedAt: cached!.project.updatedAt }
                        : p.project,
            };
        });

        // Filter out cached projects that might have been synced (same ID in remote)
        const remoteIds = new Set(remote.map((p) => p.project.id));
        const localOnly = cachedProjects.filter((p) => !remoteIds.has(p.project.id));

        // Combine and sort by updatedAt descending
        const combined = [...remote, ...localOnly];
        combined.sort((a, b) => {
            const dateA = new Date(a.project.updatedAt).getTime();
            const dateB = new Date(b.project.updatedAt).getTime();
            return dateB - dateA;
        });

        return combined;
    }, [remoteProjects, cachedProjects]);

    // Combined loading state
    // Desktop: wait for cache to be ready, show cached projects while remote loads
    // Web: wait for auth check + cache load, only wait for remote if authenticated
    const isLoading = isTauri()
        ? isLocalLoading || (isRemoteLoading && cachedProjects.length === 0)
        : isAuthLoading || isLocalLoading || (!!user && isRemoteLoading);

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
    const { user, isLoading: isUserLoading } = useCookieUser();
    const isAuthenticated = !isUserLoading && !!user;

    // Check local storage before fetching — local-only projects must never hit the cloud API.
    // Also track whether the project exists in cache at all, so unauthenticated users can open
    // cached cloud projects in offline mode without being redirected.
    const [isLocalOnly, setIsLocalOnly] = useState<boolean | null>(null);
    const [isCachedLocally, setIsCachedLocally] = useState<boolean | null>(null);

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        const check = async () => {
            const { getCachedProject } = await import("@src/lib/persistence/storage-provider/local-persistence");
            const local = await getCachedProject(projectId);
            if (!cancelled) {
                setIsLocalOnly(local?.isLocalOnly ?? false);
                setIsCachedLocally(local !== null);
            }
        };
        check();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // Fetch cloud membership only for authenticated users with non-local projects
    const shouldFetch = isAuthenticated && isLocalOnly === false && !!projectId;

    const { data, error, isLoading, mutate } = useSWR<ProjectMembershipPayload, { status?: number }>(
        shouldFetch ? `/api/projects/${projectId}` : null,
    );

    useEffect(() => {
        if (data && !isLoading) {
            updateProject(data);
        }
    }, [data, isLoading, updateProject]);

    // The cloud copy is gone (e.g. owner lost Pro and the project was demoted server-side,
    // or it was deleted from another device). Offline-first: if we still have it cached
    // locally, fall back to that copy instead of redirecting away.
    const cloudMissing = error?.status === 404 && isCachedLocally === true;

    // Treat as locally accessible: explicitly local-only, any cached project when offline,
    // or a cached project whose cloud copy disappeared.
    const isLocalAccessible =
        isLocalOnly === true ||
        (!isAuthenticated && !isUserLoading && isCachedLocally === true) ||
        cloudMissing;

    return {
        membership: data,
        isLocalOnly: isLocalAccessible,
        isLoading: isUserLoading || isLocalOnly === null || isCachedLocally === null || (shouldFetch && isLoading && !error),
        mutate,
    };
};

const useProjectInvites = (projectId: string | undefined) => {
    const { data, isLoading, mutate } = useSWR<ProjectInvite[]>(projectId ? `/api/projects/${projectId}/invite` : null);
    return { invites: data || [], isLoading, mutate };
};

const useProjectCollaborators = (projectId: string | undefined) => {
    const { data, isLoading, mutate } = useSWR<Collaborator[]>(projectId ? `/api/projects/${projectId}/members` : null);
    return { collaborators: data || [], isLoading, mutate };
};

const usePage = (): Page | undefined => {
    const pathname = usePathname();
    if (!pathname) return undefined;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "index";
    const lastSegment = segments[segments.length - 1];
    return isPage(lastSegment) ? (lastSegment as Page) : "index";
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
 * Hook to read project metadata from the cache (IndexedDB on browser, SQLite on desktop).
 */
const useCachedProjectInfo = (projectId: string | null) => {
    const [title, setTitle] = useState<string>("Untitled");
    const [description, setDescription] = useState<string | null>(null);
    const [author, setAuthor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!projectId) {
            setIsLoading(false);
            return;
        }

        const loadCachedProject = async () => {
            try {
                const { getCachedProject } = await import("@src/lib/persistence/storage-provider/local-persistence");
                const cachedProject = await getCachedProject(projectId);
                if (cachedProject) {
                    setTitle(cachedProject.title);
                    setDescription(cachedProject.description);
                    setAuthor(cachedProject.author);
                }
            } catch (error) {
                console.error("[useCachedProjectInfo] Failed to load cached project:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadCachedProject();
    }, [projectId]);

    return { title, description, author, isLoading };
};

const useIsPro = () => {
    const { user, isLoading } = useUser();
    const isPro = !!user?.isProUntil && new Date(user.isProUntil) > new Date();
    return { isPro, isLoading };
};

const useDesktopBridgeAuth = () => {
    const { mutate } = useSWRConfig();
    const pollAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => { pollAbortRef.current?.abort(); };
    }, []);

    const completeBridgeAuth = useCallback(async (nonce: string): Promise<"success" | "timeout" | "aborted"> => {
        pollAbortRef.current?.abort();
        const controller = new AbortController();
        pollAbortRef.current = controller;

        const { pollBridgeToken, setDesktopToken } = await import("@src/lib/desktop-auth");
        const token = await pollBridgeToken(nonce, { signal: controller.signal });
        if (!token) return controller.signal.aborted ? "aborted" : "timeout";

        await setDesktopToken(token);
        await mutate("/api/users/cookie");
        await mutate("/api/users");
        return "success";
    }, [mutate]);

    return { completeBridgeAuth };
};

const useFormatTimestamp = () => {
    const t = useTranslations("dates");
    return useCallback(
        (ts: number | string | Date): string => {
            const date = new Date(ts);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) return t("justNow");
            if (diffMins < 60) return t("minutesAgo", { mins: diffMins });

            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return t("hoursAgo", { hours: diffHours });

            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return t("daysAgo", { days: diffDays });

            return date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
            });
        },
        [t],
    );
};

export {
    useDraggable,
    useUser,
    useCookieUser,
    useSettings,
    useIsPro,
    useProjectMemberships,
    useProjectMembership,
    useProjectInvites,
    useProjectCollaborators,
    usePage,
    useDesktop,
    useIsPhone,
    useCachedProjects,
    useCachedProjectInfo,
    useProjectIdFromUrl,
    useDesktopBridgeAuth,
    useFormatTimestamp,
};
