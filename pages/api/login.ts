import { NextApiRequest, NextApiResponse } from "next";
import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { extractUserFromSession, getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";

import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import { Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import z from "zod";

const BodySchema = z.object({
    email: z.string(),
    password: z.string(),
});

/**
 * POST `/login`
 *
 * Authenticates a user into the application, issuing a cookie
 */
async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
    const { email, password } = validate(BodySchema, req.body);

    const user = await UserService.getUserFromEmail(email, true);
    if (!user) {
        throw new UnauthorizedError(WRONG_CREDENTIALS);
    }

    const matchingPassword = await SecretService.checkPassword(user.secrets, password);
    if (!matchingPassword) {
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
