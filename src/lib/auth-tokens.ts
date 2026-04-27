/**
 * Centralized auth-token plumbing.
 *
 * Every site that mints or verifies an Auth.js JWE in this app routes through
 * here so the salts, cookie names, and TTLs stay in lockstep across flows.
 *
 * Two token formats are in play:
 *
 *  - **Web session cookie** — read by Auth.js's own `auth()`/`getToken()`. Auth.js
 *    uses the cookie *name* as the JWE salt by default, and the name varies by
 *    environment (`__Secure-authjs.session-token` on HTTPS,
 *    `authjs.session-token` otherwise). `encodeWebSessionCookie()` returns the
 *    JWE alongside the name/secure flag so callers can set the cookie.
 *
 *  - **Desktop bearer** — sent by Tauri clients in `Authorization: Bearer <jwe>`.
 *    Always salted with `DESKTOP_BEARER_SALT`. Rotating the salt invalidates
 *    every desktop token in circulation.
 */

import { encode } from "next-auth/jwt";

export const DESKTOP_BEARER_SALT = "authjs.session-token";

// Mirrors auth.ts session.maxAge — keep in sync with the JWT session TTL there.
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type EncodedTokenPayload = {
    id: string;
    email: string;
    role: string;
    createdAt: string;
};

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

function getSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("Server is missing AUTH_SECRET");
    return secret;
}

export async function encodeDesktopBearer(payload: EncodedTokenPayload): Promise<string> {
    return encode({
        token: payload,
        secret: getSecret(),
        salt: DESKTOP_BEARER_SALT,
        maxAge: SESSION_TTL_SECONDS,
    });
}

export async function encodeWebSessionCookie(
    payload: EncodedTokenPayload,
): Promise<{ jwe: string; name: string; secure: boolean }> {
    const { name, secure } = getWebSessionCookie();
    const jwe = await encode({
        token: payload,
        secret: getSecret(),
        salt: name,
        maxAge: SESSION_TTL_SECONDS,
    });
    return { jwe, name, secure };
}
