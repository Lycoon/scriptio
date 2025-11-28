import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_USER_DELETION, USER_DELETED } from "@src/lib/messages";
import { getCookieUser } from "@src/lib/session";
import { deleteUserFromId, getUserFromId } from "@src/server/service/user-service";
import { ResponseAPI } from "@src/lib/utils/requests";

export default async function userRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        return ResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "GET":
            return getMethod(user.id, res);
        case "DELETE":
            return deleteMethod(user.id, res);
    }
}

async function getMethod(userId: number, res: NextApiResponse) {
    const fetchedUser = await getUserFromId(userId);
    if (!fetchedUser) {
        return ResponseAPI(res, 500, "An error occurred while fetching user from database");
    }

    return ResponseAPI(res, 200, "", fetchedUser);
}

async function deleteMethod(userId: number, res: NextApiResponse) {
    const deleted = await deleteUserFromId(userId);
    if (!deleted) {
        return ResponseAPI(res, 500, FAILED_USER_DELETION);
    }

    return ResponseAPI(res, 200, USER_DELETED, null);
}
