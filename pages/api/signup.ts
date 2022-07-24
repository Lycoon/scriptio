import { NextApiRequest, NextApiResponse } from "next";
import { sendVerificationEmail } from "../../src/lib/mail/mail";
import { onError, onSuccess } from "../../src/lib/utils";
import {
    EMAIL_ALREADY_REGISTERED,
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

        const now = new Date().getTime();
        const lastEmailHash = existing.secrets.lastEmailHash.getTime();
        const lastEmailMinutes = (now - lastEmailHash) / 1000 / 60;

        if (lastEmailMinutes < 5) {
            return onError(res, 500, ERROR_VERIFICATION_THROTTLE);
        }

        const secrets = generateSecrets(password);
        secrets.lastEmailHash = new Date();

        await updateUser({
            id: { id: existing.id },
            secrets,
        });

        sendVerificationEmail(existing.id, email, secrets.emailHash!);
        return onSuccess(res, 200, VERIFICATION_SENT, null);
    }

    const created = await createUser(email, password);
    if (!created) {
        return onError(res, 500, "User could not be created");
    }

    onSuccess(res, 201, VERIFICATION_SENT, null);
}
