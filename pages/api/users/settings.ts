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

const UpdateSettingsBodySchema = z.object({
    keybinds: z.record(z.string(), z.string()).optional(),
    theme: z.enum(["light", "dark"]).optional(),
    language: z.literal("en").optional(),
});

type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

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
    const user = await UserService.getUserSettings(userId);
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
    const updated = await UserService.updateUserFromId(userId, {
        settings: body,
    });

    if (!updated) {
        throw new InternalServerError(FAILED_USER_SETTINGS_UPDATE);
    }

    return SuccessNoContent(res);
}

export default apiHandler(settingsRoute);
