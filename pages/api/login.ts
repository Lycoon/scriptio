import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "@src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import { checkPassword, getUserFromEmail } from "@src/server/service/user-service";
import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { onResponseAPI } from "@src/lib/utils/requests";
import { CookieUser } from "@src/lib/utils/types";

export default withIronSessionApiRoute(loginRoute, sessionOptions);

async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
    const { email, password } = await req.body;

    const user = await getUserFromEmail(email, true);
    if (!user) {
        return onResponseAPI(res, 401, WRONG_CREDENTIALS);
    }

    const matchingPassword = await checkPassword(user.secrets, password);
    if (!email || !password || !matchingPassword) {
        return onResponseAPI(res, 401, WRONG_CREDENTIALS);
    }

    if (!user.verified) {
        return onResponseAPI(res, 401, NOT_VERIFIED);
    }

    // Filling session with data
    try {
        const cookieUser = {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            isLoggedIn: true,
        } as CookieUser;

        req.session.user = cookieUser;
        await req.session.save();

        return onResponseAPI(res, 200, "", cookieUser);
    } catch (error) {
        return onResponseAPI(res, 500, (error as Error).message);
    }
}
