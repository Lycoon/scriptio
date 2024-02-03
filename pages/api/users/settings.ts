import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_USER_SETTINGS_UPDATE, MISSING_BODY, USER_SETTINGS_UPDATED } from "@src/lib/messages";
import { getUserFromId, updateUser } from "@src/server/service/user-service";
import { ResponseAPI } from "@src/lib/utils/requests";
import { getCookieUser } from "@src/lib/session";

export default async function settingsRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        return ResponseAPI(res, 403, "Forbidden");
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
        return ResponseAPI(res, 404, "User with id " + userId + " not found");
    }

    return ResponseAPI(res, 200, "", user.settings);
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
    if (!body) {
        return ResponseAPI(res, 400, MISSING_BODY);
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
        return ResponseAPI(res, 500, FAILED_USER_SETTINGS_UPDATE);
    }

    return ResponseAPI(res, 200, USER_SETTINGS_UPDATED, null);
}
