import { NextApiRequest, NextApiResponse } from "next";
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
import z from "zod";

type RecoveryBody = z.infer<typeof RecoveryBodySchema>;
const RecoveryBodySchema = z.object({
    email: z.string(),
});

type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;
const UpdatePasswordBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    password: z.string(),
    recoverHash: z.string(),
});

async function recoverRoute(req: NextApiRequest, res: NextApiResponse) {
    switch (req.method) {
        case "POST":
            const recoveryBody = validate(RecoveryBodySchema, req.body);
            return recoverPassword(recoveryBody, res);
        case "PATCH":
            const updatePwdBody = validate(UpdatePasswordBodySchema, req.body);
            return updatePassword(updatePwdBody, res);
    }
}

/**
 * POST `/recover`
 *
 * Hit once a user asks to recover its password (when unautheticated)
 */
async function recoverPassword(body: RecoveryBody, res: NextApiResponse) {
    const { email } = body;
    const user = await UserService.getUserFromEmail(email);
    if (!user) {
        // Don't tell the user if the email is registered or not
        return Success(res, null, RECOVERY_REQUEST_FULFILLED);
    }

    const recoverHash = await UserService.updateRecoveryHash(user.id);
    sendRecoveryEmail(user.id, user.email, recoverHash);

    return Success(res, null, RECOVERY_REQUEST_FULFILLED);
}

/**
 * PATCH `/recover`
 *
 * Hit when a user changes its password (when unauthenticated)
 */
async function updatePassword(body: UpdatePasswordBody, res: NextApiResponse) {
    const { password, userId, recoverHash } = body;

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

    const updated = await UserService.updateUser({
        id: { id: user.id },
        secrets: {
            password: newPassword,
            recoverHash: null,
        },
    });

    if (!updated) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    return Success(res, null, RECOVERY_SUCCESS);
}

export default apiHandler(recoverRoute);
