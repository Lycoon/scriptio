import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Routes that handle their own auth or are intentionally public
const PUBLIC_API_PREFIXES = [
    "/api/auth/", // NextAuth internals
    "/api/users/cookie", // Session probe — returns null for unauthenticated callers
    "/api/webhooks/", // External webhooks (Stripe, etc.)
    "/api/projects/accept-invite", // Accessible to unauthenticated users via invite link
    "/api/contact", // Public contact form
];

function isPublicApiRoute(pathname: string): boolean {
    return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
    if (!isPublicApiRoute(request.nextUrl.pathname)) {
        const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
        if (!token) {
            return NextResponse.json(
                { status: "error", message: "Authentication required" },
                { status: 401 },
            );
        }

        const headers = new Headers(request.headers);
        headers.set("x-user-id", token.id as string);
        headers.set("x-user-email", token.email as string);
        headers.set("x-user-created-at", (token.createdAt as string) ?? "0");
        return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
}

export const config = {
    matcher: "/api/:path*",
};
