import { NextApiRequest, NextApiResponse } from "@node_modules/next";
import { getCookieUser } from "@src/lib/session";
import { ResponseAPI } from "@src/lib/utils/requests";
import jwt from "jsonwebtoken";

export default async function ticketRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);
    const projectId = req.query["projectId"];

    if (!user || !user.id || !projectId) {
        return ResponseAPI(res, 401, "Unauthorized");
    }

    const payload = {
        userId: user.id,
        projectId: projectId,
        role: "admin", // TODO: Implement roles for projects
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: "5m" });
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    return ResponseAPI(res, 200, "", { token });
}
