/**
 * Centralized cookie + salt helpers for the auth surface.
 *
 * All sites that encode or decode NextAuth JWEs MUST import from here so the
 * salts stay in lockstep across flows.
 *
 * Two salts are in play:
 *
 *  - **Web cookie salt**: Auth.js uses the cookie *name* as the JWE salt by
 *    default. The name differs by environment ("__Secure-authjs.session-token"
 *    on HTTPS, "authjs.session-token" otherwise). Use `getWebSessionCookie()`
 *    and pass `name` as both the cookie name and the JWE salt — anything else
 *    and Auth.js's middleware (`getToken`) and `auth()` cannot decrypt the
 *    cookie we just set.
 *
 *  - **Desktop bearer salt**: a single constant (`DESKTOP_BEARER_SALT`) shared
 *    by the encoder (api/desktop/token, api/auth/magic-link/verify) and the
 *    decoder (lib/session.ts). Changing it invalidates every Tauri-side bearer
 *    token in circulation, so any rotation needs a forced sign-out.
 */

export const DESKTOP_BEARER_SALT = "authjs.session-token";

export function getWebSessionCookie(): { name: string; secure: boolean } {
    const useSecure =
        process.env.NEXTAUTH_URL?.startsWith("https://") === true ||
        process.env.AUTH_URL?.startsWith("https://") === true ||
        process.env.NODE_ENV === "production";
    return {
        name: useSecure ? "__Secure-authjs.session-token" : "authjs.session-token",
        secure: useSecure,
    };
}
