import { withIronSessionApiRoute } from "iron-session/next";
import type { NextApiRequest, NextApiResponse } from "next";
import {
    FAILED_PASSWORD_CHANGED,
    MISSING_BODY,
    PASSWORD_CHANGED,
    PASSWORD_REQUIREMENTS,
} from "@src/lib/messages";
import { sessionOptions } from "@src/lib/session";
import { generateSecrets, updateUser } from "@src/server/service/user-service";
import { onResponseAPI } from "@src/lib/utils/requests";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!req.query || !req.query.userId) {
        return onResponseAPI(res, 400, "Query not found");
    }

    const userId = +req.query.userId;
    const user = req.session.user;

    if (!user || !user.isLoggedIn || !userId || userId !== user.id) {
        return onResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "PATCH":
            return patchMethod(user.id, req.body, res);
    }
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body || !body.password) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    if (body.password.length < 8) {
        return onResponseAPI(res, 400, PASSWORD_REQUIREMENTS);
    }

    const secrets = generateSecrets(body.password);
    if (!secrets) {
        return onResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
    }

    const updated = await updateUser({
        id: { id: userId },
        secrets: {
            hash: secrets.hash,
            salt: secrets.salt,
        },
    });

    if (!updated) {
        return onResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
    }

    return onResponseAPI(res, 200, PASSWORD_CHANGED, null);
}
