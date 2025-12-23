import { UpdateSettings } from "../../server/repository/user-repository";
import { CharacterMap, getPersistentCharacters } from "../editor/characters";
import { UpdateProjectBody } from "@pages/api/projects/[projectId]";
import { CreateProjectBody } from "@pages/api/projects";
import { ApiResponse } from "./api-utils";
import { UpdateRoleBody } from "@pages/api/projects/[projectId]/members/[userId]";
import { SignupBody } from "@pages/api/signup";
import { LoginBody } from "@pages/api/login";
import { RecoverPasswordBody, RequestRecoveryBody } from "@pages/api/recover";
import { UpdatePasswordBody } from "@pages/api/users/password";

type RESTMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const request = async (url: string, method: RESTMethod, body?: Object) => {
    const json = JSON.stringify(body);
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body: json,
    });
};

/* Projects */

export const saveCharacters = async (projectId: string, characters: CharacterMap): Promise<Response> => {
    const persistentCharacters = getPersistentCharacters(characters); // Get rid of non-persistent characters
    const res = await editProject(projectId, { characters: persistentCharacters });

    //if (res.ok) projectCtx.updateSaveStatus(SaveStatus.Saved);
    //else projectCtx.updateSaveStatus(SaveStatus.Error);

    return res;
};

export const getCloudToken = async (projectId: string): Promise<string | null> => {
    const res = await request(`/api/projects/${projectId}/cloud-token`, "GET");
    if (res.ok) {
        const { data: token } = (await res.json()) as ApiResponse;
        return token;
    }
    return null;
};

export const createProject = async (userId: string, body: CreateProjectBody) => {
    return request(`/api/projects`, "POST", body);
};

export const deleteProject = (projectId: string) => {
    return request(`/api/projects/${projectId}`, "DELETE");
};

export const editProject = (projectId: string, body: UpdateProjectBody) => {
    return request(`/api/projects/${projectId}`, "PATCH", body);
};

/* Collaborators */

export const kickCollaborator = (projectId: string, userId: string) => {
    return request(`/api/projects/${projectId}/members/${userId}`, "DELETE");
};

export const inviteCollaborator = async (projectId: string, email: string) => {
    return request(`/api/projects/${projectId}/invite`, "POST", { email });
};

export const deleteInvite = async (projectId: string, email: string) => {
    return request(`/api/projects/${projectId}/invite`, "DELETE", { email });
};

export const updateMemberRole = async (projectId: string, userId: string, body: UpdateRoleBody) => {
    return request(`/api/projects/${projectId}/members/${userId}`, "PATCH", body);
};

/* Users */

export const changePassword = (body: UpdatePasswordBody) => {
    return request(`/api/users/password`, "PATCH", body);
};

export const editUserSettings = (body: UpdateSettings) => {
    return request(`/api/users/settings`, "PATCH", body);
};

/* Auth */

export const signup = (body: SignupBody) => {
    return request(`/api/signup`, "POST", body);
};

export const login = (body: LoginBody) => {
    return request(`/api/login`, "POST", body);
};

export const recoverPassword = (body: RecoverPasswordBody) => {
    return request(`/api/recover`, "PATCH", body);
};

export const requestRecovery = (body: RequestRecoveryBody) => {
    return request(`/api/recover`, "POST", body);
};
