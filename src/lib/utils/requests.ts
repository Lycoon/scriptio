import { CreateProjectBody } from "@src/app/api/projects/route";
import { UserSettings } from "./types";
import { UpdateProjectBody } from "@src/app/api/projects/[projectId]/route";
import { UpdateRoleBody } from "@src/app/api/projects/[projectId]/members/[userId]/route";
import { UpdatePasswordBody } from "@src/app/api/users/password/route";
import { SignupBody } from "@src/app/api/signup/route";
import { LoginBody } from "@src/app/api/login/route";
import { RecoverPasswordBody, RequestRecoveryBody } from "@src/app/api/recover/route";
import { ApiResponse } from "./api-utils";
import { UpdateUserBody } from "@src/app/api/users/route";

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

export const editUserSettings = (body: Partial<UserSettings>) => {
    return request(`/api/users/settings`, "PATCH", body);
};

export const editUserInfo = (body: UpdateUserBody) => {
    return request(`/api/users`, "PATCH", body);
};

/* Auth */

export const logout = () => {
    return request(`/api/logout`, "POST");
};

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
