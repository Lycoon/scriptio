import { NextApiRequest, NextApiResponse } from "next";
import { checkPassword, getUserFromEmail } from "@src/server/service/user-service";
import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { ResponseAPI } from "@src/lib/utils/requests";
import { extractUserFromSession, getSession } from "@src/lib/session";

export default async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
    const { email, password } = await req.body;

    const user = await getUserFromEmail(email, true);
    if (!user) {
        return ResponseAPI(res, 401, WRONG_CREDENTIALS);
    }

    const matchingPassword = await checkPassword(user.secrets, password);
    if (!email || !password || !matchingPassword) {
        return ResponseAPI(res, 401, WRONG_CREDENTIALS);
    }

    if (!user.verified) {
        return ResponseAPI(res, 401, NOT_VERIFIED);
    }

    // Filling session with data
    const session = await getSession(req, res);

    session.id = user.id;
    session.email = user.email;
    session.createdAt = user.createdAt;
    await session.save();

    const cookieUser = extractUserFromSession(session);
    return ResponseAPI(res, 200, "", cookieUser);
}
