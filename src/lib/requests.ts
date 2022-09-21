import { Settings } from "../server/repository/user-repository";

export const deleteProject = (userId: number, projectId: number) => {
    return request(
        `/api/users/${userId}/projects`,
        "DELETE",
        JSON.stringify({ projectId })
    );
};

export const createProject = (userId: number, body: any) => {
    return request(
        `/api/users/${userId}/projects`,
        "POST",
        JSON.stringify(body)
    );
};

export const editProject = (userId: number, body: any) => {
    return request(
        `/api/users/${userId}/projects`,
        "PATCH",
        JSON.stringify(body)
    );
};

export const changePassword = (userId: number, password: string) => {
    return request(
        `/api/users/${userId}/password`,
        "PATCH",
        JSON.stringify({ password })
    );
};

export const editUserSettings = (userId: number, body: Settings) => {
    return request(
        `/api/users/${userId}/settings`,
        "PATCH",
        JSON.stringify(body)
    );
};

export const signup = (email: string, password: string) => {
    return request(`/api/signup`, "POST", JSON.stringify({ email, password }));
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, "POST", JSON.stringify({ email, password }));
};

export const saveScreenplay = async (projectId: number, screenplay: any) => {
    editProject(projectId, {
        projectId,
        screenplay,
    });
};

const request = async (url: string, method: string, body?: string) => {
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body,
    });
};
