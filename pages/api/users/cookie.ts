import { NextApiRequest, NextApiResponse } from "next";
import { CookieUser } from "@src/lib/utils/types";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";

async function cookieRoute(req: NextApiRequest, res: NextApiResponse<CookieUser | null>) {
    const user = await getCookieUser(req, res);
    return Success(res, user);
}

export default apiHandler(cookieRoute);
