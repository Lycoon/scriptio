import useSWR from "swr";
import { useContext, useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import { CookieUser, UserSettings } from "./types";
import { ProjectContext } from "@src/context/ProjectContext";
import { Page, ScreenplayElement } from "./enums";
import { ProjectInvite, ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { KeyBindingMap, tinykeys } from "tinykeys";
import { Editor } from "@tiptap/core";
import { applyElement } from "../editor/editor";
import { DEFAULT_KEYBINDS } from "./settings";

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
    const router = useRouter();
    const [projectId, setProjectId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (router.query.projectId) setProjectId(router.query.projectId as string);
    }, [router.query.projectId]);

    return projectId;
};

interface UseUserResult {
    user: CookieUser | undefined;
    isLoading: boolean;
}

const useUser = (redirect: boolean = false): UseUserResult => {
    const { data: user, isLoading } = useSWR<CookieUser>("/api/users/cookie");

    if (redirect && !isLoading && !user) {
        Router.push("/login");
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
        // When the data has loaded, update the project
        if (data && !isLoading) {
            console.log("updating project");
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
    const router = useRouter();
    const [page, setPage] = useState<Page | undefined>(undefined);

    useEffect(() => {
        if (!router.isReady) return;

        const segments = router.pathname.split("/").filter(Boolean);
        if (segments.length === 0) {
            setPage(Page.Index);
            return;
        }

        const lastSegment = segments[segments.length - 1];
        if (Object.values(Page).includes(lastSegment as Page)) {
            setPage(lastSegment as Page);
        } else {
            // Fallback for 404s or unknown routes
            setPage(Page.Index);
        }

    }, [router.pathname, router.isReady]);

    return page;
};

export const useShortcutHandler = (
    userShortcuts: Record<string, string> | undefined,
    editor: Editor | null
) => {
    useEffect(() => {
        if (!editor) return;
        const keyBindingMap: KeyBindingMap = {};
        const userKeybinds = userShortcuts || {};

        Object.entries(DEFAULT_KEYBINDS).forEach(([id, keybind]) => {
            const combo = userKeybinds[id] || keybind.defaultCombo;
            if (!combo) return;

            // Overriding keybinds with user defined ones
            keyBindingMap[combo] = () => {
                console.log("id: ", id, " keybind: ", keybind);

                if (!editor.isFocused) return;

                //event.preventDefault();
                switch (id) {
                    case 'screenplay_scene':
                        console.log("applying scene");
                        applyElement(editor, ScreenplayElement.Scene);
                        break;
                    case 'screenplay_action':
                        applyElement(editor, ScreenplayElement.Action);
                        break;
                    case 'screenplay_character':
                        applyElement(editor, ScreenplayElement.Character);
                        break;
                    case 'screenplay_dialogue':
                        applyElement(editor, ScreenplayElement.Dialogue);
                        break;
                    case 'screenplay_parenthetical':
                        applyElement(editor, ScreenplayElement.Parenthetical);
                        break;
                    case 'screenplay_transition':
                        applyElement(editor, ScreenplayElement.Transition);
                        break;
                    case 'screenplay_section':
                        applyElement(editor, ScreenplayElement.Section);
                        break;
                    case 'screenplay_note':
                        applyElement(editor, ScreenplayElement.Note);
                        break;
                    default:
                        console.warn(`Unknown shortcut ID: ${id} set to ${keybind}`);
                }
            };
        });

        // const target = editor.view.dom;
        const unsubscribe = tinykeys(window, keyBindingMap);

        return () => {
            unsubscribe();
        };
    }, [userShortcuts, editor]);
};

export {
    useUser,
    useSettings,
    useProjectMemberships,
    useProjectMembership,
    useProjectInvites,
    useProjectCollaborators,
    usePage,
    useDesktop,
};
