import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_PASSWORD_CHANGED, MISSING_BODY, PASSWORD_CHANGED, PASSWORD_REQUIREMENTS } from "@src/lib/messages";
import { generateSecrets, updateUser } from "@src/server/service/user-service";
import { ResponseAPI } from "@src/lib/utils/requests";
import { getCookieUser } from "@src/lib/session";

export default async function passwordRoute(req: NextApiRequest, res: NextApiResponse) {
    if (!req.query || !req.query.userId) {
        return ResponseAPI(res, 400, "Query not found");
    }

    const userId = +req.query.userId;
    const user = await getCookieUser(req, res);

    if (!userId) {
        return ResponseAPI(res, 400, "User id not found");
    }

    if (!user || userId !== user.id) {
        return ResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "PATCH":
            return patchMethod(user.id, req.body, res);
    }
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body || !body.password) {
        return ResponseAPI(res, 400, MISSING_BODY);
    }

    if (body.password.length < 8) {
        return ResponseAPI(res, 400, PASSWORD_REQUIREMENTS);
    }

    const secrets = generateSecrets(body.password);
    if (!secrets) {
        return ResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
    }

    const updated = await updateUser({
        id: { id: userId },
        secrets: {
            hash: secrets.hash,
            salt: secrets.salt,
        },
    });

    if (!updated) {
        return ResponseAPI(res, 500, FAILED_PASSWORD_CHANGED);
    }

    return ResponseAPI(res, 200, PASSWORD_CHANGED, null);
}
