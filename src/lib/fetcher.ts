import { apiFetchJson } from "./api-client";

/**
 * Universal SWR fetcher. Returns the `data` field of the API envelope.
 * On Tauri, throws `{ status: 401 }` if no desktop token is cached so SWR keys
 * fall back to local SQLite storage instead of hitting an unauthenticated API.
 */
export default function fetcher<JSON = unknown>(
    input: RequestInfo,
    init?: RequestInit,
): Promise<JSON> {
    return apiFetchJson<JSON>(input, init);
}
