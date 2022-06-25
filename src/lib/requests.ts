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

const request = async (url: string, method: string, body?: string) => {
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body,
    });
};
