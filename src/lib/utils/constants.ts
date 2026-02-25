export const BASE_URL =
    typeof window !== "undefined" && window.__TAURI_INTERNALS__
        ? window.location.origin
        : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
