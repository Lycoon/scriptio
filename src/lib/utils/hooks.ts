import useSWR from "swr";
import { UpdateSettings } from "../../server/repository/user-repository";
import { useContext, useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import { CookieUser } from "./types";
import { ProjectContext } from "@src/context/ProjectContext";
import { Page } from "./enums";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";

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

interface UseSettingsResult {
    settings: UpdateSettings;
    isLoading: boolean;
    mutate: any;
}

const useSettings = (): UseSettingsResult => {
    const { data, isLoading, mutate } = useSWR<UpdateSettings>("/api/users/settings");
    const settings = data ?? {};

    return {
        settings,
        isLoading,
        mutate,
    };
};

interface UseProjectsResult {
    projects: ProjectMembershipPayload[];
    isLoading: boolean;
    mutate: any;
}

const useProjectMemberships = (): UseProjectsResult => {
    const { data, isLoading, mutate } = useSWR<ProjectMembershipPayload[]>("/api/projects");
    const projects = data ?? [];

    return {
        projects,
        isLoading,
        mutate,
    };
};

interface UseProjectResult {
    membership?: ProjectMembershipPayload;
    isLoading: boolean;
    mutate: any;
}

const useProjectMembership = (): UseProjectResult => {
    const { updateProject } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();

    let {
        data: membership,
        error,
        mutate,
        isLoading,
    } = useSWR<ProjectMembershipPayload>(projectId ? `/api/projects/${projectId}` : null);

    useEffect(() => {
        // When the data has loaded, update the project
        if (membership && !error) {
            updateProject(membership);
        }
    }, [membership]);

    return {
        membership,
        isLoading,
        mutate,
    };
};

const usePage = (): Page => {
    const router = useRouter();
    const [page, setPage] = useState<Page>(Page.Index);

    useEffect(() => {
        if (router.pathname) {
            const paths = router.pathname.split("/");

            if (paths.length === 1) setPage(Page.Index);
            else if (paths[1] === "projects") setPage(paths[3] as Page);
            else setPage(paths[1] as Page);
        }
    }, [router]);

    return page;
};

export { useUser, useSettings, useProjectMemberships, useProjectMembership, usePage, useDesktop };
