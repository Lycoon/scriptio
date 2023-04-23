import useSWR from "swr";
import { Settings } from "../../server/repository/user-repository";
import { useContext, useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import { StateResult } from "./requests";
import { CookieUser, Project } from "./types";
import { UserContext } from "../../context/UserContext";

declare global {
    interface Window {
        __TAURI__: unknown;
    }
}

const returnData = (data: any, error: any, mutate: any, isLoading: any) => {
    return {
        data,
        error,
        mutate,
        isLoading,
    };
};

const useUser = (redirect: boolean = false): StateResult<CookieUser> => {
    const { data, error, mutate, isLoading } = useSWR<CookieUser>("/api/users/cookie");

    if (redirect && !isLoading && !data?.isLoggedIn) {
        Router.push("/login");
    }

    return returnData(data, error, mutate, isLoading);
};

const useSettings = (): StateResult<Settings> => {
    const { data, error, mutate, isLoading } = useSWR<Settings>("/api/users/settings");
    return returnData(data, error, mutate, isLoading);
};

const useProjects = (): StateResult<Project[]> => {
    const { data, error, mutate, isLoading } = useSWR("/api/projects");
    return returnData(data, error, mutate, isLoading);
};

const useProjectFromUrl = (): StateResult<Project> => {
    const { updateProject } = useContext(UserContext);
    const [projectId, setProjectId] = useState<string | undefined>(undefined);
    const router = useRouter();

    let { data, error, mutate, isLoading } = useSWR<Project>(
        projectId ? `/api/projects/${projectId}` : null
    );

    // When router has loaded, set the project id
    useEffect(() => {
        if (router.query.projectId) setProjectId(router.query.projectId as string);
    }, [router.query.projectId]);

    // When the data has loaded, update the project
    useEffect(() => {
        if (data && !error) updateProject(data);
    }, [data]);

    return returnData(data, error, mutate, isLoading);
};

export { useUser, useSettings, useProjects, useProjectFromUrl };
