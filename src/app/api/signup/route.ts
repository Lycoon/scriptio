import {
    EMAIL_ALREADY_REGISTERED,
    ERROR_SIGN_UP,
    ERROR_VERIFICATION_THROTTLE,
    PASSWORD_REQUIREMENTS,
    VERIFICATION_SENT,
} from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, InternalServerError, Success, validate } from "@src/lib/utils/api-utils";
import { authenticate, getSession } from "@src/lib/session";

import * as SecretService from "@src/lib/utils/secrets";
import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as Misc from "@src/lib/utils/misc";
import * as Mail from "@src/lib/mail/mail";

import z from "zod";
import { NextRequest } from "next/server";
import { CookieUser } from "@src/lib/utils/types";

export type SignupBody = z.infer<typeof SignupBodySchema>;
const SignupBodySchema = z.object({
    email: z.email(),
    password: z.string(),
    inviteToken: z.string().optional(),
});

/**
 * POST `/signup`
 *
 * Verifies a user that just registered and clicked the link in validation mail
 */
async function signupRoute(req: NextRequest) {
    const body = await req.json();
    const { email, password, inviteToken } = validate(SignupBodySchema, body);

    if (password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const existing = await UserService.getUserFromEmail(email, true);
    if (existing) {
        if (existing.verified) {
            throw new InternalServerError(EMAIL_ALREADY_REGISTERED);
        }

        if (!existing.secrets) {
            throw new InternalServerError(ERROR_SIGN_UP);
        }

        if (!Misc.hasExpired(existing.secrets.lastEmailHash, 5, "minutes")) {
            throw new BodyFieldError(ERROR_VERIFICATION_THROTTLE);
        }

        const emailHash = await UserService.updateEmailHash(existing.id);
        Mail.sendVerificationEmail(existing.id, email, emailHash);

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
            await UserService.updateUserFromId(created.id, {
                secrets: { emailHash: null },
                verified: true,
            });

            // Automatically authenticate a user that signed up from a project invitation
            // It prevents double email address verification as he already clicked from his mail
            await authenticate(created as CookieUser);

            return Success({ redirectUrl: "/" });
        } catch (err) {}
    }

    Mail.sendVerificationEmail(created.id, email, secrets.emailHash);
    Success(null, VERIFICATION_SENT);
}

export const POST = apiHandler(signupRoute);
