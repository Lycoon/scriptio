import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];

function getCorsHeaders(origin: string) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-type",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
    };
}

export function proxy(request: NextRequest) {
    const origin = request.headers.get("origin") ?? "";
    const isTauriOrigin = ALLOWED_ORIGINS.includes(origin);

    // Handle CORS preflight
    if (request.method === "OPTIONS" && isTauriOrigin) {
        return new NextResponse(null, {
            status: 204,
            headers: getCorsHeaders(origin),
        });
    }

    const response = NextResponse.next();

    // Attach CORS headers to actual responses
    if (isTauriOrigin) {
        const headers = getCorsHeaders(origin);
        for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
        }
    }

    return response;
}

export const config = {
    matcher: "/api/:path*",
};
