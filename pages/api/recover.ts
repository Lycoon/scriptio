import { NextApiRequest, NextApiResponse } from "next";
import { sendRecoveryEmail } from "@src/lib/mail/mail";
import {
    ERROR_RECOVERY_LINK_EXPIRED,
    FAILED_PASSWORD_CHANGED,
    MISSING_BODY,
    PASSWORD_REQUIREMENTS,
    RECOVERY_REQUEST_FULFILLED,
    RECOVERY_SUCCESS,
} from "@src/lib/messages";
import { isValidDelay } from "@src/lib/utils/misc";
import {
    generateSecrets,
    getUserFromEmail,
    getUserFromId,
    updateUser,
    updateUserRecoveryHash,
} from "@src/server/service/user-service";
import { ResponseAPI } from "@src/lib/utils/requests";

export default async function recoverRoute(req: NextApiRequest, res: NextApiResponse) {
    switch (req.method) {
        case "POST": // when submitting email recovery form
            return postMethod(req.body, res);
        case "PATCH": // when submitting new password form
            return patchMethod(req.body, res);
    }
}

async function postMethod(body: any, res: NextApiResponse) {
    if (!body || !body.email) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    const user = await getUserFromEmail(body.email);
    if (!user) {
        // don't tell the user if the email is registered or not
        return ResponseAPI(res, 200, RECOVERY_REQUEST_FULFILLED, null);
    }

    const recoverHash = await updateUserRecoveryHash(user.id);

    sendRecoveryEmail(user.id, user.email, recoverHash);
    return ResponseAPI(res, 200, RECOVERY_REQUEST_FULFILLED, null);
}

async function patchMethod(body: any, res: NextApiResponse) {
    try {
        if (!body || !body.password || !body.userId || !body.recoverHash) {
            return ResponseAPI(res, 400, MISSING_BODY);
        }

        if (body.password.length < 8) {
            return ResponseAPI(res, 400, PASSWORD_REQUIREMENTS);
        }

        const userId = +body.userId!;
        const recoverHash = body.recoverHash;
        const user = await getUserFromId(userId, true);

        if (!user || recoverHash !== user.secrets.recoverHash || isValidDelay(user.secrets.lastRecoverHash, 60)) {
            return ResponseAPI(res, 500, ERROR_RECOVERY_LINK_EXPIRED);
        }

        const secrets = generateSecrets(body.password);
        if (!secrets) {
            return ResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
        }

        const updated = await updateUser({
            id: { id: user.id },
            secrets: {
                hash: secrets.hash,
                salt: secrets.salt,
                recoverHash: secrets.recoverHash,
                lastRecoverHash: secrets.lastRecoverHash,
            },
        });

        if (!updated) {
            return ResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
        }

        return ResponseAPI(res, 200, RECOVERY_SUCCESS, null);
    } catch (error: any) {
        return ResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
    }
}
