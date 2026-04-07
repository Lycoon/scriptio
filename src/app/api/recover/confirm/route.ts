import {
    ERROR_RECOVERY_LINK_EXPIRED,
    PASSWORD_REQUIREMENTS,
    RECOVERY_SUCCESS,
} from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, Success, validate } from "@src/lib/utils/api-utils";

import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import prisma from "@src/server/db";
import { NextRequest } from "next/server";
import { RecoverPasswordBodySchema } from "@src/lib/utils/api-bodies";

const RECOVER_PREFIX = "recover:";

/**
 * POST `/recover/confirm`
 *
 * Validates a recovery VerificationToken and updates the user's password.
 */
async function recoverConfirmRoute(req: NextRequest) {
    const body = await req.json();
    const { token, password } = validate(RecoverPasswordBodySchema, body);

    if (password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const hashed = SecretService.hashToken(token);
    const record = await prisma.verificationToken.findUnique({ where: { token: hashed } });

    if (!record || !record.identifier.startsWith(RECOVER_PREFIX) || record.expires < new Date()) {
        throw new BodyFieldError(ERROR_RECOVERY_LINK_EXPIRED);
    }

    const email = record.identifier.slice(RECOVER_PREFIX.length);
    const user = await UserService.getUserFromEmail(email, true);
    if (!user || !user.secrets) {
        throw new BodyFieldError(ERROR_RECOVERY_LINK_EXPIRED);
    }

    await SecretService.updatePassword(user.id, password);
    await prisma.verificationToken.delete({ where: { token: hashed } });

    return Success(null, RECOVERY_SUCCESS);
}

export const POST = apiHandler(recoverConfirmRoute);
