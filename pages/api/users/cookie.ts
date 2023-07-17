import { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "@src/lib/session";
import { onResponseAPI } from "@src/lib/utils/requests";
import { CookieUser } from "@src/lib/utils/types";

export default withIronSessionApiRoute(userRoute, sessionOptions);

async function userRoute(req: NextApiRequest, res: NextApiResponse<Partial<CookieUser> | null>) {
    let user = { isLoggedIn: false };
    if (req.session.user) {
        user.isLoggedIn = true;
        user = {
            ...req.session.user,
        };
    }

    return onResponseAPI(res, 200, "", user);
}
