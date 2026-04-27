import { UserSettings } from "./types";
import { ApiResponse } from "./api-utils";
import {
    CreateProjectBody,
    UpdateProjectBody,
    UpdateRoleBody,
    RequestMagicLinkBody,
    UpdateUserBody,
} from "./api-bodies";
import { apiFetch } from "@src/lib/api-client";

type RESTMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const request = (url: string, method: RESTMethod, body?: object): Promise<Response> => {
    return apiFetch(url, {
        method,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
};

/* Projects */

export const getCloudToken = async (projectId: string): Promise<{ token: string | null; status: number }> => {
    const res = await request(`/api/projects/${projectId}/cloud-token`, "GET");
    if (res.ok) {
        const { data: token } = (await res.json()) as ApiResponse<string>;
        return { token: token ?? null, status: res.status };
    }
    return { token: null, status: res.status };
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

/* Saves / Version History */

export interface SaveEntry {
    key: string;
    type: "auto" | "manual";
    name?: string;
    date: string;
    size: number;
}

export const listSaves = async (projectId: string): Promise<SaveEntry[]> => {
    const res = await request(`/api/projects/${projectId}/saves`, "GET");
    if (res.ok) {
        const { data } = (await res.json()) as ApiResponse<SaveEntry[]>;
        return data ?? [];
    }
    return [];
};

export const createManualSave = async (projectId: string, name: string): Promise<SaveEntry | null> => {
    const res = await request(`/api/projects/${projectId}/saves/manual`, "POST", { name });
    if (res.ok) {
        const { data } = (await res.json()) as ApiResponse<SaveEntry>;
        return data ?? null;
    }
    return null;
};

export const restoreSave = async (projectId: string, key: string) => {
    return request(`/api/projects/${projectId}/saves/restore`, "POST", { key });
};

export const renameManualSave = async (projectId: string, key: string, name: string) => {
    return request(`/api/projects/${projectId}/saves/manual`, "PATCH", { key, name });
};

export const deleteSave = async (projectId: string, key: string) => {
    return request(`/api/projects/${projectId}/saves`, "DELETE", { key });
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

export const editUserSettings = (body: Partial<UserSettings>) => {
    return request(`/api/users/settings`, "PATCH", body);
};

export const editUserInfo = (body: UpdateUserBody) => {
    return request(`/api/users`, "PATCH", body);
};

export const deleteUser = () => {
    return request(`/api/users`, "DELETE");
};

/* Auth */

export const requestMagicLink = (body: RequestMagicLinkBody) => {
    return request(`/api/auth/magic-link`, "POST", body);
};

export const submitDesktopToken = (nonce: string) => {
    return request(`/api/desktop/token`, "POST", { nonce });
};

export const cancelStripeSubscription = async (): Promise<boolean> => {
    const res = await request("/api/stripe/cancel", "POST");
    return res.ok;
};

export const createStripeCheckout = async (): Promise<{ url: string } | null> => {
    const redirectBase = typeof window !== "undefined" ? window.location.origin : undefined;
    const res = await request("/api/stripe/checkout", "POST", { redirectBase });
    if (res.ok) {
        const { data } = (await res.json()) as ApiResponse<{ url: string }>;
        return data ?? null;
    }
    return null;
};

export const verifyApplePurchase = async (jwsTransaction: string): Promise<boolean> => {
    const res = await request("/api/apple/verify", "POST", { jwsTransaction });
    return res.ok;
};
