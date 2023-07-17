import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "@src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import { onResponseAPI } from "@src/lib/utils/requests";
import { CookieUser } from "@src/lib/utils/types";

export default withIronSessionApiRoute(logoutRoute, sessionOptions);

function logoutRoute(req: NextApiRequest, res: NextApiResponse<CookieUser>) {
    req.session.destroy();
    onResponseAPI(res, 200, "", { isLoggedIn: false });
}
