import { sendRecoveryEmail } from "@src/lib/mail/mail";
import {
    ERROR_RECOVERY_LINK_EXPIRED,
    FAILED_PASSWORD_CHANGED,
    PASSWORD_REQUIREMENTS,
    RECOVERY_REQUEST_FULFILLED,
    RECOVERY_SUCCESS,
} from "@src/lib/messages";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, InternalServerError, Success, validate } from "@src/lib/utils/api-utils";

import * as Misc from "@src/lib/utils/misc";
import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import { NextRequest } from "next/server";
import { RequestRecoveryBodySchema, RecoverPasswordBodySchema } from "@src/lib/utils/api-bodies";
export type { RequestRecoveryBody, RecoverPasswordBody } from "@src/lib/utils/api-bodies";

/**
 * POST `/recover`
 *
 * Hit once a user asks to recover its password (when unautheticated)
 */
async function requestRecovery(req: NextRequest) {
    const body = await req.json();
    const { email } = validate(RequestRecoveryBodySchema, body);

    const user = await UserService.getUserFromEmail(email);
    if (!user) {
        // Don't tell the user if the email is registered or not
        return Success(null, RECOVERY_REQUEST_FULFILLED);
    }

    const recoverHash = await UserService.updateRecoveryHash(user.id);
    await sendRecoveryEmail(user.id, user.email, recoverHash);

    return Success(null, RECOVERY_REQUEST_FULFILLED);
}

/**
 * PATCH `/recover`
 *
 * Hit when a user changes its password (when unauthenticated)
 */
async function recoverPassword(req: NextRequest) {
    const body = await req.json();
    const { password, userId, recoverHash } = validate(RecoverPasswordBodySchema, body);

    if (password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const user = await UserService.getUserFromId(userId, true);
    if (!user || !user.secrets) {
        throw new BodyFieldError(ERROR_RECOVERY_LINK_EXPIRED);
    }

    if (
        !SecretService.isHashValid(recoverHash, user.secrets.recoverHash) ||
        Misc.hasExpired(user.secrets.lastRecoverHash, 15, "minutes")
    ) {
        throw new BodyFieldError(ERROR_RECOVERY_LINK_EXPIRED);
    }

    const newPassword = await SecretService.hashPassword(password);
    if (!newPassword) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    const updated = await UserService.updateUserFromId(user.id, {
        secrets: {
            password: newPassword,
            recoverHash: null,
        },
    });

    if (!updated) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    return Success(null, RECOVERY_SUCCESS);
}

export const POST = apiHandler(requestRecovery);
export const PATCH = apiHandler(recoverPassword);
