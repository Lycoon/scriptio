/**
 * Desktop authentication helpers using Tauri's secure store plugin.
 * Persists the NextAuth-encoded JWE issued by /api/desktop/token plus a small
 * cached user record so the desktop app can render its shell while offline.
 *
 * The store saves to a JSON file in the app's data directory:
 * - Windows: %APPDATA%/com.tauri.dev/
 * - macOS: ~/Library/Application Support/com.tauri.dev/
 * - Linux: ~/.local/share/com.tauri.dev/
 */

import { StoreOptions } from "@tauri-apps/plugin-store";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type Store = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>>;

export type CachedDesktopUser = {
    id: string;
    email: string;
    createdAt: string;
};

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
    if (storeInstance) return storeInstance;
    const { load } = await import("@tauri-apps/plugin-store");
    storeInstance = await load("store.json", { autoSave: true } as StoreOptions);
    return storeInstance;
}

export async function setDesktopToken(token: string): Promise<void> {
    const store = await getStore();
    await store.set(TOKEN_KEY, token);
    await store.save();
}

export async function getDesktopToken(): Promise<string | null> {
    const store = await getStore();
    const token = await store.get<string>(TOKEN_KEY);
    return token ?? null;
}

export async function clearDesktopToken(): Promise<void> {
    const store = await getStore();
    await store.delete(TOKEN_KEY);
    await store.delete(USER_KEY);
    await store.save();
}

export async function hasDesktopToken(): Promise<boolean> {
    const token = await getDesktopToken();
    return token !== null;
}

export async function setCachedDesktopUser(user: CachedDesktopUser): Promise<void> {
    const store = await getStore();
    await store.set(USER_KEY, user);
    await store.save();
}

export async function getCachedDesktopUser(): Promise<CachedDesktopUser | null> {
    const store = await getStore();
    const user = await store.get<CachedDesktopUser>(USER_KEY);
    return user ?? null;
}

/**
 * Generate a cryptographically random nonce for the OAuth bridge handshake.
 * The nonce identifies a single sign-in attempt across the desktop client and the
 * temporary in-memory bridge on the server.
 */
export function generateBridgeNonce(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Poll `/api/desktop/token/poll` until the bridge serves up the token issued by
 * the in-browser OAuth flow, or the timeout elapses. Returns null on timeout.
 */
export async function pollBridgeToken(
    nonce: string,
    options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string | null> {
    const intervalMs = options.intervalMs ?? 2000;
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const { signal } = options;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const url = `${apiBase}/api/desktop/token/poll?nonce=${encodeURIComponent(nonce)}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (signal?.aborted) return null;
        try {
            const reqHeaders: Record<string, string> = { "x-client-type": "desktop" };
            const stagingAuth = process.env.NEXT_PUBLIC_STAGING_BASIC_AUTH;
            if (stagingAuth) reqHeaders["X-Staging-Auth"] = `Basic ${stagingAuth}`;
            const res = await fetch(url, { headers: reqHeaders, signal });
            if (res.ok) {
                const json = (await res.json()) as { data?: { token?: string | null } };
                const token = json.data?.token;
                if (token) return token;
            }
        } catch (err) {
            if (signal?.aborted) return null;
            // network blip — keep polling
        }
        if (signal?.aborted) return null;
        await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, intervalMs);
            signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        }).catch(() => null);
    }
    return null;
}
