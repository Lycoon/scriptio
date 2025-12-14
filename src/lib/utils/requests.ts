import { NextApiResponse } from "next";
import { Settings } from "../../server/repository/user-repository";
import { CharacterMap, getPersistentCharacters } from "../editor/characters";
import { CookieUser, DataResult, ProjectCreated, ProjectCreation, ProjectUpdateDTO } from "./types";
import { SaveStatus } from "./enums";
import { ProjectContextType } from "@src/context/ProjectContext";

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

export const createProject = async (
    project: ProjectCreation,
    isDesktop: boolean,
    user: CookieUser
): Promise<DataResult<ProjectCreated>> => {
    let body: ProjectCreation = {
        userId: user.id,
        title: project.title,
        description: project.description,
        poster: project.poster,
    };

    let projectId;
    if (user) {
        const res = await request(`/api/projects`, APIMethod.Post, body);

        if (res.ok) {
            const json = await res.json();
            projectId = json.data.id;
        } else {
            return ErrorResponse("Project could not be created on cloud");
        }
    }

    return SuccessResponse("Project created successfully", { id: projectId });
};

export const deleteProject = (projectId: string) => {
    return request(`/api/projects?projectId=${projectId}`, APIMethod.Delete, undefined);
};

export const editProject = (body: ProjectUpdateDTO) => {
    return request(`/api/projects`, APIMethod.Patch, body);
};

export const saveCharacters = async (projectCtx: ProjectContextType, characters: CharacterMap): Promise<Response> => {
    const persistentCharacters = getPersistentCharacters(characters); // Get rid of non-persistent characters

    const projectId = projectCtx.project!.id;
    const res = await editProject({ projectId, characters: persistentCharacters });

    if (res.ok) projectCtx.updateSaveStatus(SaveStatus.Saved);
    else projectCtx.updateSaveStatus(SaveStatus.Error);

    return res;
};

// User

export const changePassword = (password: string) => {
    return request(`/api/users/password`, APIMethod.Patch, { password });
};

export const editUserSettings = (body: Settings) => {
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
