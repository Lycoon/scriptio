import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_USER_DELETION } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { deleteUserFromId, getUserFromId } from "@src/server/service/user-service";
import { apiHandler } from "@src/lib/utils/api-handler";

import { InternalServerError, Success, SuccessNoContent, UnauthorizedError } from "@src/lib/utils/api-utils";

async function userRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getUser(user.id, res);
        case "DELETE":
            return deleteUser(user.id, res);
    }
}

/**
 * GET `/users`
 *
 * Gets authenticated user information
 */
async function getUser(userId: string, res: NextApiResponse) {
    const fetchedUser = await getUserFromId(userId);
    if (!fetchedUser) {
        throw new InternalServerError("An error occurred while fetching user from database");
    }
    return Success(res, fetchedUser);
}

/**
 * DELETE `/users`
 *
 * Deletes authenticated user
 */
async function deleteUser(userId: string, res: NextApiResponse) {
    const deleted = await deleteUserFromId(userId);
    if (!deleted) {
        throw new InternalServerError(FAILED_USER_DELETION);
    }
    return SuccessNoContent(res);
}

export default apiHandler(userRoute);
