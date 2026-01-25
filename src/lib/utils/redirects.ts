import { redirect } from "next/navigation";

export const redirectHome = () => {
    redirect("/");
};


export const redirectScreenplay = (projectId: string) => {
    redirect(`/projects/screenplay?projectId=${projectId}`);
};

export const redirectBoard = (projectId: string) => {
    redirect(`/projects/board?projectId=${projectId}`);
};

export const redirectStatistics = (projectId: string) => {
    redirect(`/projects/statistics?projectId=${projectId}`);
};

export const redirectLogin = () => {
    redirect("/login");
};

export const redirectSettings = () => {
    redirect("/settings");
};
