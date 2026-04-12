import { FAILED_USER_DELETION } from "@src/lib/messages";
import { deleteUserFromId, getUserFromId } from "@src/server/service/user-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";

import * as UserService from "@src/server/service/user-service";

import { InternalServerError, Success, SuccessNoContent, validate } from "@src/lib/utils/api-utils";
import { NextRequest } from "next/server";
import { UpdateUserBodySchema } from "@src/lib/utils/api-bodies";
export type { UpdateUserBody } from "@src/lib/utils/api-bodies";

/**
 * GET `/users`
 *
 * Gets authenticated user information
 */
async function getUser(req: NextRequest, { user }: AuthApiContext) {
    const fetchedUser = await getUserFromId(user.id);
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
async function updateUser(req: NextRequest, { user }: AuthApiContext) {
    const body = await req.json();
    const updatedUserInfo = validate(UpdateUserBodySchema, body);
    const updatedUser = await UserService.updateUserFromId(user.id, {
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
async function deleteUser(req: NextRequest, { user }: AuthApiContext) {
    const deleted = await deleteUserFromId(user.id);
    if (!deleted) {
        throw new InternalServerError(FAILED_USER_DELETION);
    }
    return SuccessNoContent();
}

export const GET = apiHandler(getUser);
export const PATCH = apiHandler(updateUser);
export const DELETE = apiHandler(deleteUser);
