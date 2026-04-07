import { sendRecoveryEmail } from "@src/lib/mail/mail";
import { RECOVERY_REQUEST_FULFILLED } from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success, validate } from "@src/lib/utils/api-utils";

import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import prisma from "@src/server/db";
import { NextRequest } from "next/server";
import { RequestRecoveryBodySchema } from "@src/lib/utils/api-bodies";

const RECOVER_PREFIX = "recover:";
const RECOVER_TTL_MINUTES = 15;

/**
 * POST `/recover/request`
 *
 * Issues a password-recovery email if the address belongs to a user that has a password
 * (i.e. signed up with credentials, not OAuth-only). Always returns the same generic 200
 * response — the existence of an account, and whether it has a password, are not leaked.
 */
async function requestRecoveryRoute(req: NextRequest) {
    const body = await req.json();
    const { email } = validate(RequestRecoveryBodySchema, body);

    const user = await UserService.getUserFromEmail(email, true);
    if (user && user.secrets) {
        // Burn any prior outstanding recovery tokens for this address.
        await prisma.verificationToken.deleteMany({
            where: { identifier: RECOVER_PREFIX + email },
        });

        const rawToken = SecretService.generateToken();
        const hashed = SecretService.hashToken(rawToken);

        await prisma.verificationToken.create({
            data: {
                identifier: RECOVER_PREFIX + email,
                token: hashed,
                expires: new Date(Date.now() + RECOVER_TTL_MINUTES * 60 * 1000),
            },
        });

        await sendRecoveryEmail(email, rawToken);
    }

    return Success(null, RECOVERY_REQUEST_FULFILLED);
}

export const POST = apiHandler(requestRecoveryRoute);
