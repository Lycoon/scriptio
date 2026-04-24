import { UserSettings } from "./types";
import { ApiResponse } from "./api-utils";
import {
    CreateProjectBody,
    UpdateProjectBody,
    UpdateRoleBody,
    RequestMagicLinkBody,
    UpdateUserBody,
} from "./api-bodies";
import { isTauri } from "@tauri-apps/api/core";

type RESTMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const request = async (url: string, method: RESTMethod, body?: object) => {
    const json = JSON.stringify(body);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // In desktop mode, add client type header and use full API URL
    let fullUrl = url;
    if (isTauri()) {
        headers["x-client-type"] = "desktop";
        
        const base = API_BASE_URL || "http://localhost:3000";
        fullUrl = url.startsWith("http") ? url : `${base}${url}`;

        // Add auth token if available (dynamic import to avoid SSR issues)
        const { getDesktopToken } = await import("@src/lib/desktop-auth");
        const token = await getDesktopToken();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const stagingAuth = process.env.NEXT_PUBLIC_STAGING_BASIC_AUTH;
        if (stagingAuth) {
            headers["X-Staging-Auth"] = `Basic ${stagingAuth}`;
        }
    }

    return fetch(fullUrl, {
        headers,
        method,
        body: json,
    });
};

/**
 * Converts a WebSocket URL (ws:// or wss://) to an HTTP URL (http:// or https://).
 * Useful for calling REST endpoints on the collaboration Worker.
 */
export function getCollabHttpUrl(path: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL || "";
    const httpUrl = baseUrl.replace(/^ws/, "http");
    return `${httpUrl}${path}`;
}

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

/* Auth */

export const requestMagicLink = (body: RequestMagicLinkBody) => {
    return request(`/api/auth/magic-link`, "POST", body);
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

