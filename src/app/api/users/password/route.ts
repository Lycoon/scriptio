import { FAILED_PASSWORD_CHANGED, PASSWORD_CHANGED, PASSWORD_REQUIREMENTS } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, InternalServerError, Success, validate } from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import * as SecretService from "@src/lib/utils/secrets";
import z from "zod";
import { NextRequest } from "@node_modules/next/server";

export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;
const UpdatePasswordBodySchema = z.object({
    password: z.string(),
});

/**
 * PATCH `/users/password`
 *
 * Hit when an authenticated user updates their password
 */
async function updatePassword(req: NextRequest) {
    const user = await getCookieUser();
    if (!user) {
        throw new ForbiddenError();
    }

    const body = await req.json();
    const { password } = validate(UpdatePasswordBodySchema, body);

    if (password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const hashPassword = await SecretService.hashPassword(password);
    if (!hashPassword) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    const updated = await UserService.updateUserFromId(user.id, {
        secrets: { password: hashPassword },
    });

    if (!updated) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    return Success(null, PASSWORD_CHANGED);
}

export const PATCH = apiHandler(updatePassword);
