import { decode, getToken, type JWT } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { DESKTOP_BEARER_SALT, getWebSessionCookie } from "@src/lib/auth-tokens";

// Routes that handle their own auth or are intentionally public
const PUBLIC_API_PREFIXES = [
    "/api/auth/", // NextAuth internals
    "/api/desktop/", // Desktop OAuth bridge endpoints
    "/api/users/cookie", // Session probe — returns null for unauthenticated callers
    "/api/webhooks/", // External webhooks (Stripe, etc.)
    "/api/projects/accept-invite", // Accessible to unauthenticated users via invite link
    "/api/contact", // Public contact form
    "/api/metrics", // Prometheus scrape (gated by bearer token in route handler)
    "/api/internal/", // Worker→app callbacks (gated by a Worker-signed JWT in the route)
];

function isPublicApiRoute(pathname: string): boolean {
    return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAdminPageRoute(pathname: string): boolean {
    return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Resolve the caller's identity from either:
 *  - `Authorization: Bearer <jwe>` — desktop clients (Tauri). Encoded by
 *    /api/desktop/token and /api/auth/magic-link/verify with `DESKTOP_BEARER_SALT`.
 *  - The Auth.js session cookie — web clients. Cookie name and JWE salt vary by
 *    environment and are centralized in `getWebSessionCookie()`.
 *
 * Returns null when no valid credential is present so the caller can decide
 * whether to 401 (API) or redirect (admin page).
 */
async function resolveCaller(request: NextRequest): Promise<JWT | null> {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;

    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        try {
            const decoded = await decode({
                token: authHeader.slice(7),
                secret,
                salt: DESKTOP_BEARER_SALT,
            });
            return decoded?.id ? decoded : null;
        } catch {
            return null;
        }
    }

    const { name: cookieName } = getWebSessionCookie();
    return getToken({ req: request, secret, cookieName });
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // CORS preflights must never be blocked — the actual request that follows will be
    // auth-checked. Returning 401 here strips the CORS headers (middleware responses
    // bypass next.config.ts headers()) and causes the preflight to fail, which in
    // Tauri (origin: http://tauri.localhost) breaks every cross-origin API call.
    if (request.method === "OPTIONS") {
        return NextResponse.next();
    }

    const token = await resolveCaller(request);

    // Admin pages: proxy only checks authentication.
    // Role enforcement happens in src/app/admin/layout.tsx via auth(), which runs the
    // full jwt callback in Node.js (with DB access) and always carries a fresh role.
    // Checking role here via getToken() would read a potentially-stale JWT cookie.
    if (isAdminPageRoute(pathname)) {
        if (!token) {
            return NextResponse.redirect(new URL("/", request.url));
        }
        return NextResponse.next();
    }

    // API surface
    if (pathname.startsWith("/api/")) {
        if (isPublicApiRoute(pathname)) {
            return NextResponse.next();
        }

        if (!token) {
            return NextResponse.json(
                { status: "error", message: "Authentication required" },
                { status: 401 },
            );
        }

        const headers = new Headers(request.headers);
        headers.set("x-user-id", token.id as string);
        headers.set("x-user-email", (token.email as string) ?? "");
        headers.set("x-user-created-at", (token.createdAt as string) ?? "0");
        headers.set("x-user-role", (token.role as string) ?? "USER");
        return NextResponse.next({ request: { headers } });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/api/:path*", "/admin/:path*"],
};
