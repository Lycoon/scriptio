import { NextRequest, NextResponse } from "next/server";
import { AppError } from "./api-utils";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { UserRole } from "../../generated/client/client";
import type { CookieUser } from "./types";
import { httpRequestDurationSeconds, httpRequestsTotal } from "../metrics/registry";

export type ApiContext = {
    routeParams: RouteParams;
    searchParams: SearchParams;
    user?: CookieUser;
};

export type AuthApiContext = ApiContext & { user: CookieUser };

export type RouteParams = Record<string, string>;
export type SearchParams = Record<string, string>;

const ID_SEGMENT = /^[0-9a-z_-]{20,}$/i;

const normalizeRoute = (pathname: string): string => {
    return pathname
        .split("/")
        .map((segment) => (ID_SEGMENT.test(segment) ? ":id" : segment))
        .join("/");
};

function handleError(err: unknown): NextResponse {
    if (err instanceof AppError) {
        return NextResponse.json(
            { status: "error", message: err.message },
            { status: err.statusCode },
        );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apiHandler] Unhandled error:", err);
    return NextResponse.json({ status: "error", message }, { status: 500 });
}

export const apiHandler = <T extends ApiContext>(
    handler: (req: NextRequest, context: T) => Promise<unknown>,
) => {
    return async (
        req: NextRequest,
        { params }: { params?: Promise<RouteParams> | RouteParams } = {},
    ) => {
        const start = performance.now();
        const method = req.method;
        const route = normalizeRoute(req.nextUrl.pathname);

        const run = async (): Promise<Response> => {
            try {
                const url = new URL(req.url);
                const searchParams = Object.fromEntries(url.searchParams);
                const routeParams = params ? (params instanceof Promise ? await params : params) : {};

                const userId = req.headers.get("x-user-id");
                const user = userId
                    ? {
                          id: userId,
                          email: req.headers.get("x-user-email") ?? "",
                          createdAt: new Date(req.headers.get("x-user-created-at") ?? 0),
                          role: (req.headers.get("x-user-role") as UserRole) ?? UserRole.USER,
                      }
                    : undefined;
                const context = { routeParams, searchParams, user } as T;
                const result = await handler(req, context);

                if (result instanceof Response) return result;
                return NextResponse.json(result, { status: 200 });
            } catch (err: unknown) {
                if (isRedirectError(err)) throw err;
                return handleError(err);
            }
        };

        const response = await run();
        const status = String(response.status);
        const durationSeconds = (performance.now() - start) / 1000;
        httpRequestsTotal.inc({ method, route, status });
        httpRequestDurationSeconds.observe({ method, route, status }, durationSeconds);
        return response;
    };
};
