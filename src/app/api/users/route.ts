import { FAILED_USER_DELETION } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { deleteUserFromId, getUserFromId } from "@src/server/service/user-service";
import { apiHandler } from "@src/lib/utils/api-handler";

import * as UserService from "@src/server/service/user-service";
import z from "zod";

import { InternalServerError, Success, SuccessNoContent, UnauthorizedError, validate } from "@src/lib/utils/api-utils";
import { NextRequest } from "@node_modules/next/server";

export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const UpdateUserBodySchema = z.object({
    username: z.string().optional(),
    color: z.string().regex(HEX_COLOR_REGEX).optional(),
});

/**
 * GET `/users`
 *
 * Gets authenticated user information
 */
async function getUser(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const fetchedUser = await getUserFromId(cookie.id);
    if (!fetchedUser) {
        throw new InternalServerError("An error occurred while fetching user from database");
    }
    return Success(fetchedUser);
}

/**
 * PATCH `/users`
 *
 * Updates user info from authenticated user
 */
async function updateUser(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const body = await req.json();
    const updatedUserInfo = validate(UpdateUserBodySchema, body);
    const updatedUser = await UserService.updateUserFromId(cookie.id, {
        username: updatedUserInfo.username,
        color: updatedUserInfo.color,
    });

    if (!updatedUser) {
        throw new InternalServerError();
    }

    return SuccessNoContent();
}

/**
 * DELETE `/users`
 *
 * Deletes authenticated user
 */
async function deleteUser(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const deleted = await deleteUserFromId(cookie.id);
    if (!deleted) {
        throw new InternalServerError(FAILED_USER_DELETION);
    }
    return SuccessNoContent();
}

export const GET = apiHandler(getUser);
export const PATCH = apiHandler(updateUser);
export const DELETE = apiHandler(deleteUser);
