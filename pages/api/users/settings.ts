import { withIronSessionApiRoute } from "iron-session/next";
import type { NextApiRequest, NextApiResponse } from "next";
import {
    FAILED_USER_SETTINGS_UPDATE,
    MISSING_BODY,
    USER_SETTINGS_UPDATED,
} from "@src/lib/messages";
import { sessionOptions } from "@src/lib/session";
import { getUserFromId, updateUser } from "@src/server/service/user-service";
import { onResponseAPI } from "@src/lib/utils/requests";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.id) {
        return onResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "PATCH":
            return patchMethod(user.id, req.body, res);
        case "GET":
            return getMethod(user.id, res);
    }
}

async function getMethod(userId: number, res: NextApiResponse<any>) {
    const user = await getUserFromId(userId);
    if (!user) {
        return onResponseAPI(res, 404, "User with id " + userId + " not found");
    }

    return onResponseAPI(res, 200, "", user.settings);
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body) {
        return onResponseAPI(res, 400, MISSING_BODY);
    }

    let settings: any = {};
    if (typeof body.highlightOnHover === "boolean") {
        settings.highlightOnHover = body.highlightOnHover;
    }
    if (typeof body.sceneBackground === "boolean") {
        settings.sceneBackground = body.sceneBackground;
    }
    if (typeof body.notesColor === "string") {
        settings.notesColor = body.notesColor;
    }
    if (typeof body.exportedNotesColor === "string") {
        settings.exportedNotesColor = body.exportedNotesColor;
    }

    const updated = await updateUser({
        id: { id: userId },
        settings,
    });

    if (!updated) {
        return onResponseAPI(res, 500, FAILED_USER_SETTINGS_UPDATE);
    }

    return onResponseAPI(res, 200, USER_SETTINGS_UPDATED, null);
}
