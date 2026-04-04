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
import { NextRequest } from "next/server";

const UpdateSettingsBodySchema = z.object({
    keybinds: z.record(z.string(), z.string()).optional(),
    theme: z.enum(["light", "dark", "latte", "wonka", "mint", "blossom"]).optional(),
    language: z.enum(["en", "es", "fr", "zh", "ko", "ja", "de", "pl"]).optional(),
    themedEditor: z.boolean().optional(),
    highlightOnHover: z.boolean().optional(),
});

export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

/**
 * GET `/users/settings`
 *
 * Gets settings from authenticated user
 */
async function getSettings(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const user = await UserService.getUserSettings(cookie.id);
    if (!user) {
        throw new NotFoundError();
    }

    return Success(user.settings);
}

/**
 * PATCH `/users/settings`
 *
 * Updates settings from authenticated user
 */
async function updateSettings(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const body = await req.json();
    const newSettings = validate(UpdateSettingsBodySchema, body);
    const updated = await UserService.updateUserFromId(cookie.id, {
        settings: newSettings,
    });

    if (!updated) {
        throw new InternalServerError(FAILED_USER_SETTINGS_UPDATE);
    }

    return SuccessNoContent();
}

export const GET = apiHandler(getSettings);
export const PATCH = apiHandler(updateSettings);
