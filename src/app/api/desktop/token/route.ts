import { NextRequest } from "next/server";
import z from "zod";

import { auth } from "@src/auth";
import { apiHandler } from "@src/lib/utils/api-handler";
import { ForbiddenError, Success, validate } from "@src/lib/utils/api-utils";
import { putBridgeToken } from "@src/lib/desktop-bridge";
import { encodeDesktopBearer } from "@src/lib/auth-tokens";
import { logger } from "@src/lib/utils/logger";

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

    logger.debug("[Desktop token] Minting token for nonce", { nonce: nonce.slice(0, 8) + "…" });

    const session = await auth();
    const user = session?.user as
        | { id?: string; email?: string; createdAt?: Date | string; role?: string }
        | undefined;
    if (!user?.id) {
        logger.warn("[Desktop token] No active session for token request");
        throw new ForbiddenError("Not authenticated");
    }

    const token = await encodeDesktopBearer({
        id: user.id,
        email: user.email ?? "",
        role: user.role ?? "USER",
        createdAt:
            user.createdAt instanceof Date
                ? user.createdAt.toISOString()
                : (user.createdAt ?? new Date().toISOString()),
    });

    putBridgeToken(nonce, token);
    logger.debug("[Desktop token] Token stowed in bridge", { userId: user.id });

    return Success(null);
}

export const POST = apiHandler(desktopTokenRoute);
