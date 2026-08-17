/// <reference types="@cloudflare/workers-types" />
import { jwtVerify, JWTPayload } from "jose";
import { Env } from "./types";
import { ProjectRoom } from "./room";

interface DecodedToken extends JWTPayload {
    type?: string;
    projectId?: string;
    userId?: string;
    role?: string;
}

async function getVerifiedPayload(token: string | null, secret: string): Promise<DecodedToken | null> {
    if (!token) return null;
    try {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, secretKey);
        return payload as DecodedToken;
    } catch {
        return null;
    }
}

export { ProjectRoom };

const worker = {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Extract project ID from path (handle trailing slashes and nested paths)
        const knownSubpaths = ["blacklist", "allow", "saves", "manual", "restore"];
        const pathParts = url.pathname.split("/").filter((p) => p && !knownSubpaths.includes(p));
        const projectId = pathParts[0] || "default";

        // Determine the internal path for the DO
        const segments = url.pathname.split("/").filter(Boolean);
        // segments: [projectId, ...rest]
        const doPath = "/" + segments.slice(1).join("/");

        // Authenticated API endpoints (saves, blacklist, allow, role-update, purge)
        const isAuthEndpoint =
            url.pathname.includes("/saves") ||
            url.pathname.endsWith("/blacklist") ||
            url.pathname.endsWith("/allow") ||
            url.pathname.endsWith("/role-update") ||
            url.pathname.endsWith("/purge");

        if (isAuthEndpoint && request.method !== "GET") {
            const authHeader = request.headers.get("Authorization");
            const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);
            if (!decoded || decoded.type !== "admin-action") {
                return new Response("Unauthorized", { status: 401 });
            }

            if (decoded.projectId && decoded.projectId !== projectId) {
                return new Response("Unauthorized: Project mismatch", { status: 401 });
            }

            const stub = env.PROJECT_ROOM.get(env.PROJECT_ROOM.idFromName(projectId));
            const doUrl = new URL(request.url);
            doUrl.pathname = doPath;
            const doRequest = new Request(doUrl.toString(), request);
            doRequest.headers.set("X-Project-Id", projectId);
            return stub.fetch(doRequest);
        }

        // GET /saves and GET /asset-refs also need auth (admin-action token)
        if (
            request.method === "GET" &&
            (url.pathname.includes("/saves") || url.pathname.endsWith("/asset-refs"))
        ) {
            const authHeader = request.headers.get("Authorization");
            const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);
            if (!decoded || decoded.type !== "admin-action") {
                return new Response("Unauthorized", { status: 401 });
            }

            if (decoded.projectId && decoded.projectId !== projectId) {
                return new Response("Unauthorized: Project mismatch", { status: 401 });
            }

            const stub = env.PROJECT_ROOM.get(env.PROJECT_ROOM.idFromName(projectId));
            const doUrl = new URL(request.url);
            doUrl.pathname = doPath;
            const doRequest = new Request(doUrl.toString(), request);
            doRequest.headers.set("X-Project-Id", projectId);
            return stub.fetch(doRequest);
        }

        // WebSocket upgrade
        if (request.headers.get("Upgrade") === "websocket") {
            const token = url.searchParams.get("token");
            const decoded = await getVerifiedPayload(token, env.JWT_SECRET);

            if (!decoded || decoded.projectId !== projectId) {
                return new Response("Unauthorized", { status: 401 });
            }

            const userId = decoded.userId || decoded.sub;
            if (!userId) {
                return new Response("Invalid token: missing user ID", { status: 401 });
            }

            const newRequest = new Request(request);
            newRequest.headers.set("X-User-Id", userId);
            newRequest.headers.set("X-User-Role", decoded.role || "VIEWER");
            newRequest.headers.set("X-Project-Id", projectId);

            const stub = env.PROJECT_ROOM.get(env.PROJECT_ROOM.idFromName(projectId));
            return stub.fetch(newRequest);
        }

        return new Response("Not Found", { status: 404 });
    },
};

export default worker;
