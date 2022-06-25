import { NextApiRequest, NextApiResponse } from "next";
import { sendVerificationEmail } from "../../src/lib/mail";
import {
    EMAIL_ALREADY_REGISTERED,
    MISSING_BODY,
    PASSWORD_REQUIREMENTS,
} from "../../src/lib/messages";
import { onError, onSuccess } from "../../src/lib/utils";
import {
    createUser,
    getSecretsFromId,
    getUserFromEmail,
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
        if (existing.active) {
            return onError(res, 500, EMAIL_ALREADY_REGISTERED);
        }

        const secrets = await getSecretsFromId(existing.id);
        sendVerificationEmail(existing.id, email, secrets!.emailHash);
        return onSuccess(
            res,
            200,
            "An email has been sent to that address to confirm your account.",
            null
        );
    }

    const created = await createUser(email, password);
    if (!created) {
        return onError(res, 500, "User could not be created");
    }

    sendVerificationEmail(created.id, email, created.emailHash);
    onSuccess(
        res,
        201,
        "An email has been sent to that address to confirm your account.",
        null
    );
}
