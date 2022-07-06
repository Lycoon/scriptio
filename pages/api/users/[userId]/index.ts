import { withIronSessionApiRoute } from "iron-session/next";
import type { NextApiRequest, NextApiResponse } from "next";
import {
    FAILED_PASSWORD_CHANGED,
    FAILED_USER_DELETION,
    MISSING_BODY,
    PASSWORD_CHANGED,
    PASSWORD_REQUIREMENTS,
    USER_DELETED,
} from "../../../../src/lib/messages";
import { sessionOptions } from "../../../../src/lib/session";
import { onError, onSuccess } from "../../../../src/lib/utils";
import {
    deleteUserFromId,
    generateSecrets,
    getUserFromId,
    updateUser,
} from "../../../../src/server/service/user-service";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!req.query || !req.query.userId) {
        return onError(res, 400, "Query not found");
    }

    const userId = +req.query.userId;
    const user = req.session.user;

    if (!user || !user.isLoggedIn || !userId || userId !== user.id) {
        return onError(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "GET":
            return getMethod(user.id, res);
        case "PATCH":
            return patchMethod(user.id, req.body, res);
        case "DELETE":
            return deleteMethod(user.id, res);
    }
}

async function getMethod(userId: number, res: NextApiResponse) {
    const fetchedUser = await getUserFromId(userId);
    if (!fetchedUser) {
        return onError(res, 404, "User with id " + userId + " not found");
    }

    return onSuccess(res, 200, "", fetchedUser);
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body || !body.password) {
        return onError(res, 400, MISSING_BODY);
    }

    if (body.password.length < 8) {
        return onError(res, 400, PASSWORD_REQUIREMENTS);
    }

    const secrets = generateSecrets(body.password);
    if (!secrets) {
        return onError(res, 500, FAILED_PASSWORD_CHANGED);
    }

    const updated = await updateUser({
        id: { id: userId },
        hash: secrets.hash,
        salt: secrets.salt,
    });

    if (!updated) {
        return onError(res, 500, FAILED_PASSWORD_CHANGED);
    }

    return onSuccess(res, 200, PASSWORD_CHANGED, null);
}

async function deleteMethod(userId: number, res: NextApiResponse) {
    const deleted = await deleteUserFromId(userId);
    if (!deleted) {
        return onError(res, 500, FAILED_USER_DELETION);
    }

    return onSuccess(res, 200, USER_DELETED, null);
}
