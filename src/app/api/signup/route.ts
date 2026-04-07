import {
    EMAIL_ALREADY_REGISTERED,
    ERROR_SIGN_UP,
    ERROR_VERIFICATION_THROTTLE,
    PASSWORD_REQUIREMENTS,
    VERIFICATION_SENT,
} from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, InternalServerError, Success, validate } from "@src/lib/utils/api-utils";

import * as SecretService from "@src/lib/utils/secrets";
import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as Misc from "@src/lib/utils/misc";
import * as Mail from "@src/lib/mail/mail";
import prisma from "@src/server/db";

import { NextRequest } from "next/server";
import { SignupBodySchema } from "@src/lib/utils/api-bodies";
export type { SignupBody } from "@src/lib/utils/api-bodies";

const VERIFY_PREFIX = "verify:";
const VERIFICATION_TTL_MINUTES = 60 * 24; // 24 hours
const VERIFICATION_THROTTLE_MINUTES = 5;

/**
 * POST `/signup`
 *
 * Creates a credentials user and either:
 * - sends a verification email containing a single-use VerificationToken, or
 * - if an `inviteToken` is provided, marks the user verified, joins the project,
 *   and returns a `redirectUrl` so the client can immediately call NextAuth `signIn`.
 */
async function signupRoute(req: NextRequest) {
    const body = await req.json();
    const { email, password, inviteToken } = validate(SignupBodySchema, body);

    if (password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const existing = await UserService.getUserFromEmail(email, true);
    if (existing) {
        if (existing.emailVerified) {
            throw new InternalServerError(EMAIL_ALREADY_REGISTERED);
        }

        // Throttle re-sends: only one verification email per address per VERIFICATION_THROTTLE_MINUTES window.
        const recentToken = await prisma.verificationToken.findFirst({
            where: { identifier: VERIFY_PREFIX + email },
            orderBy: { expires: "desc" },
        });
        if (recentToken) {
            const issuedAt = new Date(recentToken.expires.getTime() - VERIFICATION_TTL_MINUTES * 60 * 1000);
            if (!Misc.hasExpired(issuedAt, VERIFICATION_THROTTLE_MINUTES, "minutes")) {
                throw new BodyFieldError(ERROR_VERIFICATION_THROTTLE);
            }
            await prisma.verificationToken.deleteMany({ where: { identifier: VERIFY_PREFIX + email } });
        }

        const rawToken = await issueVerificationToken(email);
        Mail.sendVerificationEmail(email, rawToken);

        return Success(null, VERIFICATION_SENT);
    }

    const secrets = await SecretService.createSecrets(password);
    const created = await UserService.createUser(email, secrets);
    if (!created) {
        throw new InternalServerError(ERROR_SIGN_UP);
    }

    // We don't want to send verification email if a user logs in from a project invite token
    // We need to try/catch to ignore any failure occuring invitation logic
    if (inviteToken) {
        try {
            const invite = await ProjectService.getInvite(inviteToken);
            if (!invite || invite.email !== email || Misc.hasExpired(invite.createdAt, 7, "days")) {
                // Failing to resolve invite token is passthrough, don't make the signup fail
                throw new ForbiddenError("Invalid invite token");
            }

            await ProjectService.upsertMember(invite.projectId, created.id);
            await ProjectService.deleteInviteFromToken(inviteToken);
            await UserService.setVerified(created.id);

            // Client will signIn() with the same credentials it just submitted, then route there.
            return Success({ redirectUrl: "/projects" });
        } catch (err) {}
    }

    const rawToken = await issueVerificationToken(email);
    await Mail.sendVerificationEmail(email, rawToken);
    return Success(null, VERIFICATION_SENT);
}

async function issueVerificationToken(email: string): Promise<string> {
    const rawToken = SecretService.generateToken();
    const hashed = SecretService.hashToken(rawToken);
    await prisma.verificationToken.create({
        data: {
            identifier: VERIFY_PREFIX + email,
            token: hashed,
            expires: new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000),
        },
    });
    return rawToken;
}

export const POST = apiHandler(signupRoute);
