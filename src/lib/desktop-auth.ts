/**
 * Desktop authentication helpers using Tauri's secure store plugin.
 * This module handles JWT token persistence for the desktop app.
 *
 * The store saves to a JSON file in the app's data directory:
 * - Windows: %APPDATA%/com.tauri.dev/
 * - macOS: ~/Library/Application Support/com.tauri.dev/
 * - Linux: ~/.local/share/com.tauri.dev/
 */

import { StoreOptions } from "@tauri-apps/plugin-store";

const STORE_NAME = "auth.json";
const TOKEN_KEY = "auth_token";

type Store = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>>;

let storeInstance: Store | null = null;

/**
 * Get or create the store instance (lazy loaded)
 */
async function getStore(): Promise<Store> {
    if (storeInstance) {
        return storeInstance;
    }

    const { load } = await import("@tauri-apps/plugin-store");
    storeInstance = await load("store.json", { autoSave: true } as StoreOptions);
    return storeInstance;
}

/**
 * Store the desktop auth token securely
 */
export async function setDesktopToken(token: string): Promise<void> {
    const store = await getStore();
    await store.set(TOKEN_KEY, token);
    await store.save();
}

/**
 * Retrieve the stored desktop auth token
 */
export async function getDesktopToken(): Promise<string | null> {
    const store = await getStore();
    const token = await store.get<string>(TOKEN_KEY);
    return token ?? null;
}

/**
 * Remove the stored desktop auth token (logout)
 */
export async function clearDesktopToken(): Promise<void> {
    const store = await getStore();
    await store.delete(TOKEN_KEY);
    await store.save();
}

/**
 * Check if a desktop token exists
 */
export async function hasDesktopToken(): Promise<boolean> {
    const token = await getDesktopToken();
    return token !== null;
}

/**
 * Decode the stored JWT to extract user info without server verification.
 * Used as a fallback when the server is unreachable.
 */
export async function getDesktopUserFromToken(): Promise<{
    id: string;
    email: string;
    createdAt: Date;
} | null> {
    const token = await getDesktopToken();
    if (!token) return null;

    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return {
            id: payload.id,
            email: payload.email,
            createdAt: new Date(payload.createdAt),
        };
    } catch {
        return null;
    }
}
