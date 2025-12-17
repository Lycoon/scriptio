import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { SuccessNoContent } from "@src/lib/utils/api-utils";

async function logoutRoute(req: NextApiRequest, res: NextApiResponse) {
    const session = await getSession(req, res);
    session.destroy();
    return SuccessNoContent(res);
}

export default apiHandler(logoutRoute);
