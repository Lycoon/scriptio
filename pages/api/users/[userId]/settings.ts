import { withIronSessionApiRoute } from "iron-session/next";
import type { NextApiRequest, NextApiResponse } from "next";
import {
    FAILED_PASSWORD_CHANGED,
    FAILED_USER_DELETION,
    FAILED_USER_SETTINGS_UPDATE,
    MISSING_BODY,
    PASSWORD_CHANGED,
    PASSWORD_REQUIREMENTS,
    USER_DELETED,
    USER_SETTINGS_UPDATED,
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
        case "PATCH":
            return patchMethod(user.id, req.body, res);
    }
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body) {
        return onError(res, 400, MISSING_BODY);
    }

    let settings: any = {};
    if (typeof body.highlightOnHover === "boolean") {
        settings.highlightOnHover = body.highlightOnHover;
    }

    if (typeof body.sceneBackground === "boolean") {
        settings.sceneBackground = body.sceneBackground;
    }

    const updated = await updateUser({
        id: { id: userId },
        settings,
    });

    if (!updated) {
        return onError(res, 500, FAILED_USER_SETTINGS_UPDATE);
    }

    return onSuccess(res, 200, USER_SETTINGS_UPDATED, null);
}
