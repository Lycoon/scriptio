import { NextApiRequest, NextApiResponse } from "next";
import { sendVerificationEmail } from "../../src/lib/mail/mail";
import { isValidDelay, onError, onSuccess } from "../../src/lib/utils";
import {
    EMAIL_ALREADY_REGISTERED,
    ERROR_SIGN_UP,
    ERROR_VERIFICATION_THROTTLE,
    MISSING_BODY,
    PASSWORD_REQUIREMENTS,
    VERIFICATION_SENT,
} from "../../src/lib/messages";
import {
    createUser,
    generateSecrets,
    getUserFromEmail,
    updateUser,
} from "../../src/server/service/user-service";

export default async function signup(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const email: string = req.body.email;
    const password: string = req.body.password;

    if (!email || !password) {
        return onError(res, 400, MISSING_BODY);
    }

    if (password.length < 8) {
        return onError(res, 400, PASSWORD_REQUIREMENTS);
    }

    const existing = await getUserFromEmail(email, true);
    if (existing) {
        if (existing.verified) {
            return onError(res, 500, EMAIL_ALREADY_REGISTERED);
        }

        if (!isValidDelay(existing.secrets.lastEmailHash, 5)) {
            return onError(res, 500, ERROR_VERIFICATION_THROTTLE);
        }

        const secrets = generateSecrets(password);
        if (!secrets) {
            return onError(res, 500, ERROR_SIGN_UP);
        }

        const updated = await updateUser({
            id: { id: existing.id },
            secrets,
        });

        if (!updated) {
            return onError(res, 500, ERROR_SIGN_UP);
        }

        sendVerificationEmail(existing.id, email, secrets.emailHash!);
        return onSuccess(res, 200, VERIFICATION_SENT, null);
    }

    const created = await createUser(email, password);
    if (!created) {
        return onError(res, 500, ERROR_SIGN_UP);
    }

    onSuccess(res, 201, VERIFICATION_SENT, null);
}
