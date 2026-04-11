import crypto from "crypto";

/**
 * In-memory bridge for desktop OAuth flows.
 *
 * The desktop client opens an external browser to /desktop-oauth/start with a nonce.
 * After OAuth completes, /desktop-oauth/complete posts the nonce + the freshly signed
 * NextAuth JWE to /api/desktop/token, which stores it here under the hashed nonce.
 * The desktop client polls /api/desktop/token/poll until the token is available.
 *
 * Single-instance only — replace with Redis if the app is ever horizontally scaled.
 */

type StoredToken = {
    token: string;
    expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000; // 5 minutes — generous enough for slow OAuth flows.

// Survive Next.js dev hot-reloads by stashing the Map on globalThis.
const globalForBridge = globalThis as unknown as { __desktopBridge?: Map<string, StoredToken> };
const store: Map<string, StoredToken> = globalForBridge.__desktopBridge ?? new Map();
if (!globalForBridge.__desktopBridge) globalForBridge.__desktopBridge = store;

const hashNonce = (nonce: string) => crypto.createHash("sha256").update(nonce).digest("hex");

const sweep = () => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
        if (value.expiresAt <= now) store.delete(key);
    }
};

export const putBridgeToken = (nonce: string, token: string): void => {
    sweep();
    store.set(hashNonce(nonce), { token, expiresAt: Date.now() + TTL_MS });
};

export const takeBridgeToken = (nonce: string): string | null => {
    sweep();
    const key = hashNonce(nonce);
    const entry = store.get(key);
    if (!entry) return null;
    store.delete(key);
    return entry.token;
};
