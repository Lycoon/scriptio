import { ERROR_MAGIC_LINK_EXPIRED } from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, Success, validate } from "@src/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";
import { encode } from "next-auth/jwt";

import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import * as ProjectService from "@src/server/service/project-service";
import * as MagicLinkService from "@src/server/service/magic-link-service";
import * as Misc from "@src/lib/utils/misc";
import { putBridgeToken } from "@src/lib/desktop-bridge";

import { VerifyMagicLinkBodySchema } from "@src/lib/utils/api-bodies";
export type { VerifyMagicLinkBody } from "@src/lib/utils/api-bodies";

const SESSION_COOKIE_SALT = "authjs.session-token";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // mirrors auth.ts maxAge

/**
 * Cookie name NextAuth/Auth.js expects when verifying the JWT session.
 * Must stay in sync with Auth.js's internal default for the credentials/JWT cookie:
 *   https → "__Secure-authjs.session-token", http → "authjs.session-token".
 */
function getSessionCookieName(): { name: string; secure: boolean } {
    const useSecure =
        process.env.NEXTAUTH_URL?.startsWith("https://") === true ||
        process.env.AUTH_URL?.startsWith("https://") === true ||
        process.env.NODE_ENV === "production";
    return {
        name: useSecure ? "__Secure-authjs.session-token" : "authjs.session-token",
        secure: useSecure,
    };
}

/**
 * POST `/api/auth/magic-link/verify`
 *
 * Consumes a magic-link token. The token is deleted before any user mutation
 * runs, so it cannot be replayed even if a downstream step throws.
 *
 *   - Web browser: sets the NextAuth session cookie and returns `{ mode: "web" }`.
 *   - Desktop bridge: stores the freshly minted JWE in the bridge under the
 *     `desktopNonce` saved alongside the link, then returns `{ mode: "desktop" }`
 *     so the page can show "return to the desktop app" and the polling client
 *     can pick the token up via `/api/desktop/token/poll`.
 */
async function verifyMagicLinkRoute(req: NextRequest) {
    const body = await req.json();
    const { token } = validate(VerifyMagicLinkBodySchema, body);

    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new BodyFieldError("Server is missing AUTH_SECRET");

    const tokenHash = SecretService.hashToken(token);

    // Atomically claim the token: deleteMany on the unique hash either deletes one row
    // or zero, so two concurrent verifications can never both succeed.
    const record = await MagicLinkService.findByHash(tokenHash);
    if (!record) throw new BodyFieldError(ERROR_MAGIC_LINK_EXPIRED);

    const claim = await MagicLinkService.consumeByHash(tokenHash);
    if (claim.count === 0 || record.expiresAt < new Date()) {
        throw new BodyFieldError(ERROR_MAGIC_LINK_EXPIRED);
    }

    let user = await UserService.getUserFromEmail(record.email);
    if (!user) {
        user = await UserService.createUser(record.email);
    } else if (!user.emailVerified) {
        await UserService.setVerified(user.id);
    }

    // Best-effort invite acceptance — never let an invite failure block sign-in.
    if (record.inviteToken) {
        try {
            const invite = await ProjectService.getInvite(record.inviteToken);
            if (
                invite &&
                invite.email.toLowerCase() === record.email &&
                !Misc.hasExpired(invite.createdAt, 7, "days")
            ) {
                await ProjectService.upsertMember(invite.projectId, user.id);
                await ProjectService.deleteInviteFromToken(record.inviteToken);
            }
        } catch (err) {
            console.error("[magic-link] Invite acceptance failed:", err);
        }
    }

    const jwe = await encode({
        token: {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt.toISOString(),
        },
        secret,
        salt: SESSION_COOKIE_SALT,
        maxAge: SESSION_TTL_SECONDS,
    });

    if (record.desktopNonce) {
        // Desktop flow: hand the JWE to the bridge for the polling client to pick up.
        // Do NOT set a session cookie on whichever browser opened the magic link, since
        // it may not be the same machine running the desktop app.
        putBridgeToken(record.desktopNonce, jwe);
        return Success({ mode: "desktop" });
    }

    // Web flow: set the NextAuth session cookie directly so the browser is signed in.
    const { name, secure } = getSessionCookieName();
    const response = NextResponse.json(
        { status: "success", data: { mode: "web" } },
        { status: 200 },
    );
    response.cookies.set({
        name,
        value: jwe,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
    return response;
}

export const POST = apiHandler(verifyMagicLinkRoute);
