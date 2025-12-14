import { NextApiRequest, NextApiResponse } from "next";
import { sendRecoveryEmail } from "@src/lib/mail/mail";
import {
    ERROR_RECOVERY_LINK_EXPIRED,
    FAILED_PASSWORD_CHANGED,
    PASSWORD_REQUIREMENTS,
    RECOVERY_REQUEST_FULFILLED,
    RECOVERY_SUCCESS,
} from "@src/lib/messages";
import { isValidDelay } from "@src/lib/utils/misc";
import { apiHandler } from "@src/lib/utils/api-handler";
import {
    BodyFieldError,
    InternalServerError,
    MissingBodyError,
    Success,
    SuccessNoContent,
} from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";

async function recoverRoute(req: NextApiRequest, res: NextApiResponse) {
    switch (req.method) {
        case "POST": // when submitting email recovery form
            return recoverPassword(req.body, res);
        case "PATCH": // when submitting new password form
            return updatePassword(req.body, res);
    }
}

async function recoverPassword(body: any, res: NextApiResponse) {
    if (!body || !body.email) {
        throw new MissingBodyError();
    }

    const user = await UserService.getUserFromEmail(body.email);
    if (!user) {
        // Don't tell the user if the email is registered or not
        return Success(res, RECOVERY_REQUEST_FULFILLED);
    }

    const recoverHash = await UserService.updateRecoveryHash(user.id);
    sendRecoveryEmail(user.id, user.email, recoverHash);

    return Success(res, null, RECOVERY_REQUEST_FULFILLED);
}

async function updatePassword(body: any, res: NextApiResponse) {
    if (!body || !body.password || !body.userId || !body.recoverHash) {
        throw new MissingBodyError();
    }

    if (body.password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const userId = +body.userId!;
    const recoverHash = body.recoverHash;
    const user = await UserService.getUserFromId(userId, true);

    if (!user || recoverHash !== user.secrets.recoverHash || isValidDelay(user.secrets.lastRecoverHash, 60)) {
        throw new BodyFieldError(ERROR_RECOVERY_LINK_EXPIRED);
    }

    const secrets = UserService.generateSecrets(body.password);
    if (!secrets) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    const updated = await UserService.updateUser({
        id: { id: user.id },
        secrets: {
            hash: secrets.hash,
            salt: secrets.salt,
            recoverHash: secrets.recoverHash,
            lastRecoverHash: secrets.lastRecoverHash,
        },
    });

    if (!updated) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    return Success(res, null, RECOVERY_SUCCESS);
}

export default apiHandler(recoverRoute);
