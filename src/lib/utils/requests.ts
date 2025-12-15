import { UpdateSettings } from "../../server/repository/user-repository";
import { CharacterMap, getPersistentCharacters } from "../editor/characters";
import { SaveStatus } from "./enums";
import { ProjectContextType } from "@src/context/ProjectContext";
import { UpdateProjectBody } from "@pages/api/projects/[projectId]";
import { CreateProjectBody } from "@pages/api/projects";

enum APIMethod {
    Get = "GET",
    Post = "POST",
    Patch = "PATCH",
    Delete = "DELETE",
}

const request = async (url: string, method: APIMethod, body?: Object) => {
    const json = JSON.stringify(body);
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body: json,
    });
};

// API Responses

export const ErrorResponse = (message: string) => {
    return { message, isError: true };
};

export const SuccessResponse = (message: string, data: any) => {
    return { message, data, isError: false };
};

// Project

export const getCollabToken = async (projectId: string): Promise<string | null> => {
    const res = await request(`/api/projects/${projectId}/collab-token`, APIMethod.Get);
    if (res.ok) {
        const { data: token } = await res.json();
        return token;
    }
    return null;
};

export const createProject = async (userId: number, body: CreateProjectBody) => {
    return request(`/api/projects`, APIMethod.Post, body);
};

export const deleteProject = (projectId: string) => {
    return request(`/api/projects/${projectId}`, APIMethod.Delete);
};

export const editProject = (projectId: string, body: UpdateProjectBody) => {
    return request(`/api/projects/${projectId}`, APIMethod.Patch, body);
};

export const saveCharacters = async (projectCtx: ProjectContextType, characters: CharacterMap): Promise<Response> => {
    const persistentCharacters = getPersistentCharacters(characters); // Get rid of non-persistent characters

    const projectId = projectCtx.project!.id;
    const res = await editProject(projectId, { characters: persistentCharacters });

    if (res.ok) projectCtx.updateSaveStatus(SaveStatus.Saved);
    else projectCtx.updateSaveStatus(SaveStatus.Error);

    return res;
};

// User

export const changePassword = (password: string) => {
    return request(`/api/users/password`, APIMethod.Patch, { password });
};

export const editUserSettings = (body: UpdateSettings) => {
    return request(`/api/users/settings`, APIMethod.Patch, body);
};

// Authentication

export const signup = (email: string, password: string, inviteToken?: string) => {
    return request(`/api/signup`, APIMethod.Post, { email, password, inviteToken });
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, APIMethod.Post, { email, password });
};

export const validateRecover = (userId: number, recoverHash: string, password: string) => {
    return request(`/api/recover`, APIMethod.Patch, { userId, recoverHash, password });
};

export const sendRecover = (email: string) => {
    return request(`/api/recover`, APIMethod.Post, { email });
};
