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
        `/api/users/${userId}`,
        "PATCH",
        JSON.stringify({ password })
    );
};

export const signup = (email: string, password: string) => {
    return request(`/api/signup`, "POST", JSON.stringify({ email, password }));
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, "POST", JSON.stringify({ email, password }));
};

const request = async (url: string, method: string, body?: string) => {
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body,
    });
};
