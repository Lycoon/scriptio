import { redirect } from "next/navigation";

export const redirectHome = () => {
    redirect("/");
};

export const redirectExport = (projectId: string) => {
    redirect(`/projects/${projectId}/export`);
};

export const redirectProjectInfo = (projectId: string) => {
    redirect(`/projects/${projectId}/edit`);
};

export const redirectScreenplay = (projectId: string) => {
    redirect(`/projects/${projectId}/screenplay`);
};

export const redirectTitlePage = (projectId: string) => {
    redirect(`/projects/${projectId}/title`);
};

export const redirectBoard = (projectId: string) => {
    redirect(`/projects/${projectId}/board`);
};

export const redirectStatistics = (projectId: string) => {
    redirect(`/projects/${projectId}/statistics`);
};

export const redirectReports = (projectId: string) => {
    redirect(`/projects/${projectId}/reports`);
};

export const redirectLogin = () => {
    redirect("/login");
};

export const redirectSettings = () => {
    redirect("/settings");
};
