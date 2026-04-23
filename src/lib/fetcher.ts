import { isTauri } from "@tauri-apps/api/core";
import { getDesktopToken } from "./desktop-auth";

/**
 * The base URL for the API when running in desktop mode.
 * Set this environment variable to your hosted API server URL.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Fetcher for desktop environment - calls remote API with JWT auth.
 * Desktop app connects to your hosted API server with JWT in Authorization header.
 *
 * Note: Magic-link auth requests don't use this fetcher - they make direct fetch calls.
 * This fetcher is used by SWR for authenticated data fetching.
 */
async function fetchFromDesktop<JSON = unknown>(
    input: RequestInfo,
    init?: RequestInit,
): Promise<JSON> {
    const token = await getDesktopToken();

    // No token = not logged in. Skip the remote request entirely.
    // The app will fall back to local SQLite storage via useCachedProjects().
    if (!token) {
        throw { message: "Not authenticated", status: 401 };
    }

    const url = typeof input === "string" ? input : input.url;
    const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-client-type": "desktop",
        Authorization: `Bearer ${token}`,
    };

    const stagingAuth = process.env.NEXT_PUBLIC_STAGING_BASIC_AUTH;
    if (stagingAuth) {
        headers["X-Staging-Auth"] = `Basic ${stagingAuth}`;
    }

    if (init?.headers) {
        Object.assign(headers, init.headers as Record<string, string>);
    }

    let response: Response;
    try {
        response = await fetch(fullUrl, {
            ...init,
            headers,
        });
    } catch {
        // Network error (server unreachable) - throw structured error so SWR won't retry
        throw { message: "Server unreachable", status: 0, isNetworkError: true };
    }

    const data = await response.json() as { data?: JSON; message?: string; status?: number };

    if (response.ok) {
        return data.data as JSON;
    }

    const error = { ...data, status: response.status };
    throw error;
}

/**
 * Fetcher for web environment - calls Next.js API routes with cookies
 */
async function fetchFromBrowser<JSON = unknown>(
    input: RequestInfo,
    init?: RequestInit,
): Promise<JSON> {
    const response = await fetch(input, init);
    const data = await response.json() as { data?: JSON; message?: string; status?: number };

    if (response.ok) {
        return data.data as JSON;
    }

    // Include status code in the error for SWR's shouldRetryOnError
    const error = { ...data, status: response.status };
    throw error;
}

/**
 * Universal fetcher that routes based on environment:
 * - Desktop (Tauri): Calls remote API with JWT in Authorization header
 * - Web: Calls local Next.js API routes with cookies
 */
export default async function fetcher<JSON = unknown>(
    input: RequestInfo,
    init?: RequestInit,
): Promise<JSON> {
    if (isTauri()) {
        return fetchFromDesktop<JSON>(input, init);
    }
    return fetchFromBrowser<JSON>(input, init);
}
