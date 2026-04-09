import { redirect } from "next/navigation";

export const redirectHome = () => {
    redirect("/projects");
};

export const redirectProject = (projectId: string) => {
    redirect(`/projects?projectId=${projectId}`);
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
