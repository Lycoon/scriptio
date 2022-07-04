import { NextApiRequest, NextApiResponse } from "next";
import { sendVerificationEmail } from "../../src/lib/mail/mail";
import { onError, onSuccess } from "../../src/lib/utils";
import {
    EMAIL_ALREADY_REGISTERED,
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

    const existing = await getUserFromEmail(email);
    if (existing) {
        if (existing.verified) {
            return onError(res, 500, EMAIL_ALREADY_REGISTERED);
        }

        const secrets = generateSecrets(password);
        await updateUser({
            id: { id: existing.id },
            emailHash: secrets.emailHash,
            hash: secrets.hash,
            salt: secrets.salt,
        });
        sendVerificationEmail(existing.id, email, secrets.emailHash);

        return onSuccess(res, 200, VERIFICATION_SENT, null);
    }

    const created = await createUser(email, password);
    if (!created) {
        return onError(res, 500, "User could not be created");
    }

    onSuccess(res, 201, VERIFICATION_SENT, null);
}
