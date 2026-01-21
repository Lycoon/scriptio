import { invoke, isTauri } from "@tauri-apps/api/core";
import { getDesktopToken } from "./desktop-auth";

/**
 * The base URL for the API when running in desktop mode.
 * Set this environment variable to your hosted API server URL.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Fetcher for desktop environment - calls remote API with JWT auth.
 * Desktop app connects to your hosted API server with JWT in Authorization header.
 */
async function fetchFromDesktop<JSON = unknown>(input: RequestInfo, init?: RequestInit): Promise<JSON> {
    const url = typeof input === "string" ? input : input.url;
    const token = await getDesktopToken();

    // Build full URL for remote API
    const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-client-type": "desktop",
    };

    // Merge any existing headers from init
    if (init?.headers) {
        const existingHeaders = init.headers as Record<string, string>;
        Object.assign(headers, existingHeaders);
    }

    // Add auth token if available (not needed for login)
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(fullUrl, {
        ...init,
        headers,
    });

    const data: any = await response.json();

    if (response.ok) {
        return data.data;
    }

    throw data;
}

/**
 * Fetcher for web environment - calls Next.js API routes with cookies
 */
async function fetchFromBrowser<JSON = unknown>(input: RequestInfo, init?: RequestInit): Promise<JSON> {
    const response = await fetch(input, init);
    const data: any = await response.json();

    if (response.ok) {
        return data.data;
    }

    throw data;
}

/**
 * Universal fetcher that routes based on environment:
 * - Desktop (Tauri): Calls remote API with JWT in Authorization header
 * - Web: Calls local Next.js API routes with cookies
 */
export default async function fetcher<JSON = unknown>(input: RequestInfo, init?: RequestInit): Promise<JSON> {
    if (isTauri()) {
        return fetchFromDesktop<JSON>(input, init);
    }
    return fetchFromBrowser<JSON>(input, init);
}
