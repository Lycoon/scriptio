import type { CookieUser } from "../api/users/index";

import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import {
    checkPassword,
    getUserFromEmail,
} from "../../src/server/service/user-service";
import { onError, onSuccess } from "../../src/lib/utils";
import { NOT_VERIFIED, WRONG_CREDENTIALS } from "../../src/lib/messages";

export default withIronSessionApiRoute(loginRoute, sessionOptions);

async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
    const { email, password } = await req.body;

    const user = await getUserFromEmail(email, true);
    if (!user) {
        return onError(res, 401, WRONG_CREDENTIALS);
    }

    const matchingPassword = await checkPassword(user.secrets, password);
    if (!email || !password || !matchingPassword) {
        return onError(res, 401, WRONG_CREDENTIALS);
    }

    if (!user.verified) {
        return onError(res, 401, NOT_VERIFIED);
    }

    // Filling session with data
    try {
        const cookieUser = {
            isLoggedIn: true,
            id: user.id,
            email: user.email,
        } as CookieUser;

        req.session.user = cookieUser;
        await req.session.save();

        return onSuccess(res, 200, "", cookieUser);
    } catch (error) {
        return onError(res, 500, (error as Error).message);
    }
}
