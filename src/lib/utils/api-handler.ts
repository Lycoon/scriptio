import { NextRequest, NextResponse } from "next/server";
import { AppError } from "./api-utils";
import { isRedirectError } from "next/dist/client/components/redirect-error";

type AppHandler = (req: NextRequest, context: ApiContext) => Promise<NextResponse | Response | any>;

export type ApiContext = {
    routeParams: RouteParams;
    searchParams: SearchParams;
};

export type RouteParams = Record<string, string>;
export type SearchParams = Record<string, string>;

export const apiHandler = (handler: AppHandler) => {
    return async (req: NextRequest, { params }: { params?: Promise<RouteParams> | RouteParams } = {}) => {
        try {
            const url = new URL(req.url);
            const searchParams = Object.fromEntries(url.searchParams);
            const routeParams = params ? (params instanceof Promise ? await params : params) : {};
            const result = await handler(req, { routeParams, searchParams });

            if (result instanceof Response) return result;
            return NextResponse.json(result, { status: 200 });
        } catch (err: any) {
            // If a redirect, rethrow it
            if (isRedirectError(err)) {
                throw err;
            }

            // Expected errors
            if (err instanceof AppError) {
                return NextResponse.json(
                    {
                        status: "error",
                        message: err.message,
                    },
                    { status: err.statusCode }
                );
            }

            // Unhandled errors
            const message = err instanceof Error ? err.message : String(err);
            console.error("[apiHandler] Unhandled error:", err);
            return NextResponse.json({ status: "error", message }, { status: 500 });
        }
    };
};
