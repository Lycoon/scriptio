import useSWR from "swr";
import { Settings } from "../../server/repository/user-repository";
import { useContext, useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import { CookieUser, Project } from "./types";
import { UserContext } from "../../context/UserContext";
import { useDesktopValues } from "../store";

const returnData = (data: any, error: any, mutate: any, isLoading: any) => {
    return {
        data,
        error,
        mutate,
        isLoading,
    };
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

const useUser = (redirect: boolean = false): StateResult<CookieUser> => {
    const { data: user, isLoading } = useSWR<CookieUser>("/api/users/cookie");

    if (redirect && !isLoading && !user) {
        Router.push("/login");
    }

    return { data: user, isLoading };
};

const useDesktop = (): boolean => {
    const [isDesktop, setIsDesktop] = useState<boolean>(false);

    useEffect(() => {
        if (window.__TAURI__) setIsDesktop(true);
    }, []);

    return isDesktop;
};

const useSettings = (): StateResult<Settings> => {
    const { data, error, mutate, isLoading } = useSWR<Settings>("/api/users/settings");
    return returnData(data, error, mutate, isLoading);
};

const useProjects = (): StateResult<Project[]> => {
    const { data: user } = useUser();

    // Fetch local projects if we're on desktop
    const { data: localProjects, isLoading: isLocalLoading, error: isLocalError } = useDesktopValues("projects.cfg");

    // Fetch cloud projects if we're logged in
    const {
        data: cloudProjects,
        isLoading: isCloudLoading,
        error: isCloudError,
        mutate,
    } = useSWR(user ? "/api/projects" : null);

    return returnData(
        [...(cloudProjects ?? []), ...(localProjects ?? [])],
        isCloudError || isLocalError,
        mutate,
        isCloudLoading || isLocalLoading
    );
};

const useProjectFromUrl = (): StateResult<Project> => {
    const { updateProject } = useContext(UserContext);
    const projectId = useProjectIdFromUrl();

    let { data, error, mutate, isLoading } = useSWR<Project>(projectId ? `/api/projects/${projectId}` : null);

    // When the data has loaded, update the project
    useEffect(() => {
        if (data && !error) updateProject(data);
    }, [data]);

    return returnData(data, error, mutate, isLoading);
};

export { useUser, useSettings, useProjects, useProjectFromUrl, useDesktop };
