import { NextApiRequest, NextApiResponse } from "next";
import { ResponseAPI } from "@src/lib/utils/requests";
import { CookieUser } from "@src/lib/utils/types";
import { getSession } from "@src/lib/session";

export default async function logoutRoute(req: NextApiRequest, res: NextApiResponse<CookieUser>) {
    const session = await getSession(req, res);
    session.destroy();

    ResponseAPI(res, 200, "");
}
