import { NextApiRequest, NextApiResponse } from "next";
import { ResponseAPI } from "@src/lib/utils/requests";
import { CookieUser } from "@src/lib/utils/types";
import { getCookieUser } from "@src/lib/session";

export default async function cookieRoute(req: NextApiRequest, res: NextApiResponse<CookieUser | null>) {
    const user = await getCookieUser(req, res);
    return ResponseAPI(res, 200, "", user);
}
