import { NextApiResponse } from "next";
import { Settings } from "../../server/repository/user-repository";
import { CharacterMap } from "./characters";
import { useTauriStore } from "../store";
import { useDesktop } from "./hooks";

export interface StateResult<T> {
    data?: T;
    isLoading: boolean;
    error?: any;
    mutate?: (data?: T, shouldRevalidate?: boolean) => Promise<T | undefined>;
}

export const onSuccess = (res: NextApiResponse, code: number, message: string, data: any) => {
    res.status(code).json(onResponse("SUCCESS", message, data));
};

export const onError = (res: NextApiResponse, code: number, message: string) => {
    res.status(code).json(onResponse("FAILED", message));
};

const onResponse = (status: string, message: string, data?: any) => {
    return {
        status,
        message,
        data,
    };
};

// Projects
export const deleteProject = (projectId: string) => {
    return request(`/api/projects`, "DELETE", JSON.stringify({ projectId }));
};

export const createProject = (body: any) => {
    const isDesktop = useDesktop();
    const { state, setState, loading } = useTauriStore("user", null, "scriptio.cfg");

    return request(`/api/projects`, "POST", JSON.stringify(body));
};

export const editProject = (body: any) => {
    return request(`/api/projects`, "PATCH", JSON.stringify(body));
};

// User
export const changePassword = (password: string) => {
    return request(`/api/users/password`, "PATCH", JSON.stringify({ password }));
};

export const editUserSettings = (body: Settings) => {
    return request(`/api/users/settings`, "PATCH", JSON.stringify(body));
};

// Authentication
export const signup = (email: string, password: string) => {
    return request(`/api/signup`, "POST", JSON.stringify({ email, password }));
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, "POST", JSON.stringify({ email, password }));
};

export const validateRecover = (userId: number, recoverHash: string, password: string) => {
    return request(`/api/recover`, "PATCH", JSON.stringify({ userId, recoverHash, password }));
};

export const sendRecover = (email: string) => {
    return request(`/api/recover`, "POST", JSON.stringify({ email }));
};

// Screenplay
export const saveScreenplay = async (
    projectId: string,
    screenplay: any,
    characters: any
): Promise<Response> => {
    return editProject({ projectId, screenplay, characters });
};

export const saveProjectCharacters = async (projectId: string, characters: CharacterMap) => {
    editProject({
        projectId,
        characters,
    });
};

const request = async (url: string, method: string, body?: string) => {
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body,
    });
};
