/**
 * Shared HTTP client used by both the SWR fetcher (`fetcher.ts`) and the explicit
 * request helpers (`utils/requests.ts`).
 *
 * Handles two environments:
 *  - Web: relative URLs hit Next.js routes; cookies do the auth.
 *  - Tauri desktop: rewrites relative URLs against `NEXT_PUBLIC_API_URL`, attaches
 *    the cached desktop JWE in `Authorization: Bearer …`, and tags the request
 *    with `x-client-type: desktop`.
 */

import { isTauri } from "@tauri-apps/api/core";

const DEFAULT_DESKTOP_API_BASE = "http://localhost:3000";

function resolveUrl(input: RequestInfo): string {
    const url = typeof input === "string" ? input : input.url;
    if (!isTauri() || url.startsWith("http")) return url;
    const base = process.env.NEXT_PUBLIC_API_URL || DEFAULT_DESKTOP_API_BASE;
    return `${base}${url}`;
}

async function buildHeaders(initHeaders?: HeadersInit): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (initHeaders) Object.assign(headers, initHeaders as Record<string, string>);

    if (isTauri()) {
        headers["x-client-type"] = "desktop";
        const { getDesktopToken } = await import("./desktop-auth");
        const token = await getDesktopToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

/**
 * Issue an authenticated API request and return the raw `Response`.
 * Callers decide what to do with the body and status.
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const headers = await buildHeaders(init?.headers);
    return fetch(resolveUrl(input), { ...init, headers });
}

/**
 * Issue an authenticated API request, parse the JSON envelope, and return the
 * `data` field. Throws a structured error on non-2xx responses so SWR can react.
 *
 * The desktop variant additionally short-circuits when no token is cached — the
 * caller falls back to local storage rather than firing a doomed network request.
 */
export async function apiFetchJson<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> {
    if (isTauri()) {
        const { getDesktopToken } = await import("./desktop-auth");
        const token = await getDesktopToken();
        if (!token) throw { message: "Not authenticated", status: 401 };
    }

    let response: Response;
    try {
        response = await apiFetch(input, init);
    } catch {
        throw { message: "Server unreachable", status: 0, isNetworkError: true };
    }

    const json = (await response.json()) as { data?: T; message?: string; status?: number };
    if (response.ok) return json.data as T;
    throw { ...json, status: response.status };
}
