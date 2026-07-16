"use client";

/**
 * Client-side navigation between the projects list (`/projects`) and an open
 * project (`/projects?projectId=…`). Both are the same route, differing only by
 * the `projectId` search param — which the projects page reads reactively via
 * `useSearchParams`, so swapping the param is enough to switch views.
 *
 * The swap uses the native History API instead of `router.replace()`. Next
 * (14.1+) syncs `useSearchParams`/`usePathname` with `history.replaceState`, so
 * the view updates the same way — but without the router's RSC payload fetch.
 * That fetch is what broke the Tauri app: under the static-export custom
 * protocol (`tauri://localhost`, entry `projects.html`) it fails
 * intermittently, and the router then falls back to a hard navigation to
 * `/projects`, a path the protocol can't resolve — so the click did nothing.
 * `history.replaceState` never leaves the webview and also keeps the current
 * pathname untouched (`/projects.html` in Tauri, `/projects` on the web).
 *
 * Also do not use the `redirect()` helpers in `./redirects` from Client
 * Components: `redirect()` is a server API that navigates by throwing
 * `NEXT_REDIRECT`, which is unreliable in client event handlers and silently
 * swallowed after an `await`.
 */
const replaceSearch = (search: string) => {
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
};

// Stable identity: no router dependency, so hook consumers can safely list the
// returned functions in effect/callback deps.
const navigation = {
    goToProjects: () => replaceSearch(""),
    goToProject: (projectId: string) => replaceSearch(`?projectId=${projectId}`),
};

export const useAppNavigation = () => navigation;
