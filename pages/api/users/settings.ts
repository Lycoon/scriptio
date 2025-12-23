import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_USER_SETTINGS_UPDATE } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import {
    InternalServerError,
    NotFoundError,
    Success,
    SuccessNoContent,
    UnauthorizedError,
    validate,
} from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import z from "zod";

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;
const UpdateSettingsBodySchema = z.object({
    highlightOnHover: z.boolean().optional(),
    sceneBackground: z.boolean().optional(),
    notesColor: z.string().regex(HEX_COLOR_REGEX, { message: "Invalid hex color code" }).optional(),
    exportedNotesColor: z.string().regex(HEX_COLOR_REGEX, { message: "Invalid hex color code" }).optional(),
    onlineUsername: z.string().optional(),
    onlineColor: z.string().regex(HEX_COLOR_REGEX, { message: "Invalid hex color code" }).optional(),
});

async function settingsRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getSettings(user.id, res);
        case "PATCH":
            const body = validate(UpdateSettingsBodySchema, req.body);
            return updateSettings(user.id, body, res);
    }
}

/**
 * GET `/users/settings`
 *
 * Gets settings from authenticated user
 */
async function getSettings(userId: string, res: NextApiResponse<any>) {
    const user = await UserService.getUserFromId(userId);
    if (!user) {
        throw new NotFoundError();
    }
    return Success(res, user.settings);
}

/**
 * PATCH `/users/settings`
 *
 * Updates settings from authenticated user
 */
async function updateSettings(userId: string, body: UpdateSettingsBody, res: NextApiResponse) {
    let settings: any = {};
    settings.highlightOnHover = body.highlightOnHover;
    settings.sceneBackground = body.sceneBackground;
    settings.notesColor = body.notesColor;
    settings.exportedNotesColor = body.exportedNotesColor;

    const updated = await UserService.updateUser({
        id: { id: userId },
        settings,
    });

    if (!updated) {
        throw new InternalServerError(FAILED_USER_SETTINGS_UPDATE);
    }

    return SuccessNoContent(res);
}

export default apiHandler(settingsRoute);
