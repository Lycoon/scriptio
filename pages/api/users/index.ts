import { withIronSessionApiRoute } from "iron-session/next";
import type { NextApiRequest, NextApiResponse } from "next";
import { FAILED_USER_DELETION, USER_DELETED } from "@src/lib/messages";
import { sessionOptions } from "@src/lib/session";
import { deleteUserFromId, getUserFromId } from "@src/server/service/user-service";
import { onResponseAPI } from "@src/lib/utils/requests";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.id) {
        return onResponseAPI(res, 403, "Forbidden");
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
        return onResponseAPI(res, 500, "An error occurred while fetching user from database");
    }

    return onResponseAPI(res, 200, "", fetchedUser);
}

async function deleteMethod(userId: number, res: NextApiResponse) {
    const deleted = await deleteUserFromId(userId);
    if (!deleted) {
        return onResponseAPI(res, 500, FAILED_USER_DELETION);
    }

    return onResponseAPI(res, 200, USER_DELETED, null);
}
