import { redirect, RedirectType } from "next/navigation";

export const redirectHome = () => {
    redirect("/projects", RedirectType.replace);
};

export const redirectProject = (projectId: string) => {
    redirect(`/projects?projectId=${projectId}`, RedirectType.replace);
};

// Legacy aliases for backwards compatibility during migration
export const redirectScreenplay = (projectId: string) => {
    redirectProject(projectId);
};

export const redirectBoard = (projectId: string) => {
    redirectProject(projectId);
};

export const redirectStatistics = (projectId: string) => {
    redirectProject(projectId);
};
