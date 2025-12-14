import { NextApiRequest, NextApiResponse } from "next";
import { CookieUser } from "@src/lib/utils/types";
import { getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";

async function logoutRoute(req: NextApiRequest, res: NextApiResponse<CookieUser>) {
    const session = await getSession(req, res);
    session.destroy();
    return Success(res);
}

export default apiHandler(logoutRoute);
