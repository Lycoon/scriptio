import { MAGIC_LINK_SENT, MAGIC_LINK_THROTTLED } from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success, validate } from "@src/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";

import * as SecretService from "@src/lib/utils/secrets";
import * as Mail from "@src/lib/mail/mail";
import * as MagicLinkService from "@src/server/service/magic-link-service";

import { RequestMagicLinkBodySchema } from "@src/lib/utils/api-bodies";
export type { RequestMagicLinkBody } from "@src/lib/utils/api-bodies";

const TOKEN_TTL_MINUTES = 10;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_TOKENS = 3;

/**
 * POST `/api/auth/magic-link`
 *
 * Issues a single-use magic link to the supplied email and emails it. Always returns
 * a generic success response — never discloses whether the address is registered.
 *
 * Rate-limited per email: at most RATE_LIMIT_MAX_TOKENS issued per
 * RATE_LIMIT_WINDOW_MINUTES window. Stale tokens are also swept on every call.
 *
 * `desktopNonce` (optional): when present the verifier will additionally hand the
 * resulting JWE off to the desktop bridge under that nonce, mirroring the OAuth flow.
 * `inviteToken` (optional): persisted alongside the magic link so that, after sign-in,
 * the user is automatically added to the matching project.
 */
async function issueMagicLinkRoute(req: NextRequest) {
    const body = await req.json();
    const { email, desktopNonce, inviteToken } = validate(RequestMagicLinkBodySchema, body);
    const normalizedEmail = email.toLowerCase().trim();

    // Sweep expired records first so the rate-limit window only counts live ones.
    await MagicLinkService.sweepExpired();

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await MagicLinkService.countRecent(normalizedEmail, windowStart);

    if (recentCount >= RATE_LIMIT_MAX_TOKENS) {
        return NextResponse.json(
            { status: "error", message: MAGIC_LINK_THROTTLED },
            { status: 429 },
        );
    }

    const rawToken = SecretService.generateToken();
    const tokenHash = SecretService.hashToken(rawToken);

    await MagicLinkService.issue({
        email: normalizedEmail,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
        desktopNonce: desktopNonce ?? null,
        inviteToken: inviteToken ?? null,
    });

    // Fire-and-forget: never block the response on the SMTP round-trip, and never
    // surface mail failures to the caller (would leak whether the address exists).
    Mail.sendMagicLinkEmail(normalizedEmail, rawToken).catch((err) => {
        console.error("[magic-link] Failed to send email:", err);
    });

    return Success(null, MAGIC_LINK_SENT);
}

export const POST = apiHandler(issueMagicLinkRoute);
