export const BASE_URL =
    typeof window !== "undefined" && window.__TAURI_INTERNALS__
        ? window.location.origin
        : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Default browser tab title, mirroring the root layout metadata. Anything that
 * overwrites `document.title` (the open project's name) must restore this when
 * it goes away, since the app swaps views by rewriting the query string and
 * Next never re-applies the route metadata.
 */
export const APP_TITLE = "Scriptio | Screenwriting Software";
