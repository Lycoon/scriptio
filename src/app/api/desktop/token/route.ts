import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import z from "zod";

import { auth } from "@src/auth";
import { apiHandler } from "@src/lib/utils/api-handler";
import { ForbiddenError, BodyFieldError, Success, validate } from "@src/lib/utils/api-utils";
import { putBridgeToken } from "@src/lib/desktop-bridge";

const SESSION_COOKIE_SALT = "authjs.session-token";
const DESKTOP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days, mirrors auth.ts maxAge.

const BodySchema = z.object({
    nonce: z.string().min(16),
});

/**
 * POST `/api/desktop/token`
 *
 * Called from the in-browser /desktop-oauth/complete page after the user signs in
 * with NextAuth. Reads the active web session, mints an equivalent NextAuth JWE,
 * stows it in the bridge under the supplied nonce, and returns 200. The desktop
 * client (which never sees this token in the URL) then polls for it.
 */
async function desktopTokenRoute(req: NextRequest) {
    const body = await req.json();
    const { nonce } = validate(BodySchema, body);

    const session = await auth();
    const user = session?.user as { id?: string; email?: string; createdAt?: Date | string } | undefined;
    if (!user?.id) {
        throw new ForbiddenError("Not authenticated");
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new BodyFieldError("Server is missing AUTH_SECRET");
    }

    const token = await encode({
        token: {
            id: user.id,
            email: user.email,
            createdAt:
                user.createdAt instanceof Date
                    ? user.createdAt.toISOString()
                    : (user.createdAt ?? new Date().toISOString()),
        },
        secret,
        salt: SESSION_COOKIE_SALT,
        maxAge: DESKTOP_TOKEN_TTL_SECONDS,
    });

    putBridgeToken(nonce, token);
    return Success(null);
}

export const POST = apiHandler(desktopTokenRoute);
