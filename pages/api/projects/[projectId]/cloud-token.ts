import { NextApiRequest, NextApiResponse } from "@node_modules/next";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";
import jwt from "jsonwebtoken";

import * as ProjectService from "@src/server/service/project-service";

import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
});

async function projectCloudTokenRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    const { projectId } = query;

    const user = await getCookieUser(req, res);
    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new UnauthorizedError();
    }

    const payload = {
        userId: user.id,
        projectId: projectId,
        role: member.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" });
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    return Success(res, token);
}

export default apiHandler(projectCloudTokenRoute);
