import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_PASSWORD_CHANGED, PASSWORD_CHANGED, PASSWORD_REQUIREMENTS } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, ForbiddenError, InternalServerError, Success, validate } from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import * as SecretService from "@src/lib/utils/secrets";
import z from "zod";

export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;
const UpdatePasswordBodySchema = z.object({
    password: z.string(),
});

async function passwordRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);
    if (!user) {
        throw new ForbiddenError();
    }

    switch (req.method) {
        case "PATCH":
            const body = validate(UpdatePasswordBodySchema, req.body);
            return updatePassword(user.id, body, res);
    }
}

/**
 * PATCH `/users/password`
 *
 * Hit when an authenticated user updates their password
 */
async function updatePassword(userId: number, body: UpdatePasswordBody, res: NextApiResponse) {
    if (body.password.length < 8) {
        throw new BodyFieldError(PASSWORD_REQUIREMENTS);
    }

    const password = await SecretService.hashPassword(body.password);
    if (!password) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    const updated = await UserService.updateUser({
        id: { id: userId },
        secrets: {
            password,
        },
    });

    if (!updated) {
        throw new InternalServerError(FAILED_PASSWORD_CHANGED);
    }

    return Success(res, null, PASSWORD_CHANGED);
}

export default apiHandler(passwordRoute);
