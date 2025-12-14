import { NextApiRequest, NextApiResponse } from "next";
import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { extractUserFromSession, getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";

import * as UserService from "@src/server/service/user-service";
import { BodyFieldError, MissingBodyError, Success, UnauthorizedError } from "@src/lib/utils/api-utils";

async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
    if (!req.body) {
        throw new MissingBodyError();
    }

    const email: string = req.body.email;
    const password: string = req.body.password;
    if (!email || !password) {
        throw new BodyFieldError("Email and password are required");
    }

    const user = await UserService.getUserFromEmail(email, true);
    if (!user) {
        throw new UnauthorizedError(WRONG_CREDENTIALS);
    }

    const matchingPassword = await UserService.checkPassword(user.secrets, password);
    if (!email || !password || !matchingPassword) {
        throw new UnauthorizedError(WRONG_CREDENTIALS);
    }

    if (!user.verified) {
        throw new UnauthorizedError(NOT_VERIFIED);
    }

    // Filling session with data
    const session = await getSession(req, res);
    session.id = user.id;
    session.email = user.email;
    session.createdAt = user.createdAt;
    await session.save();

    const cookieUser = extractUserFromSession(session);
    return Success(res, cookieUser);
}

export default apiHandler(loginRoute);
