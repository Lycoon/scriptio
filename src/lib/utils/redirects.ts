// Server-only navigation helpers (route handlers / server components). Client
// Components must use `useAppNavigation` from `./navigation` instead — redirect()
// navigates by throwing NEXT_REDIRECT, which is unreliable in client event
// handlers and swallowed after an await.
import { redirect, RedirectType } from "next/navigation";

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
