import Router from "next/router";

export const redirectHome = () => {
    Router.push("/");
};

export const redirectExport = (projectId: string) => {
    Router.push(`/projects/${projectId}/export`);
};

export const redirectProjectInfo = (projectId: string) => {
    Router.push(`/projects/${projectId}/edit`);
};

export const redirectScreenplay = (projectId: string) => {
    Router.push(`/projects/${projectId}/screenplay`);
};

export const redirectTitlePage = (projectId: string) => {
    Router.push(`/projects/${projectId}/title`);
};

export const redirectStory = (projectId: string) => {
    Router.push(`/projects/${projectId}/story`);
};

export const redirectStatistics = (projectId: string) => {
    Router.push(`/projects/${projectId}/stats`);
};

export const redirectReports = (projectId: string) => {
    Router.push(`/projects/${projectId}/reports`);
};

export const redirectLogin = () => {
    Router.push("/login");
};

export const redirectSettings = () => {
    Router.push("/settings");
};
