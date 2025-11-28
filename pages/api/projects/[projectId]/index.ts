import { NextApiRequest, NextApiResponse } from "next";
import { getProjectFromId } from "@src/server/service/project-service";
import { ResponseAPI } from "@src/lib/utils/requests";
import { getCookieUser } from "@src/lib/session";

export default async function projectIdRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);
    const projectId = req.query["projectId"];

    if (!user || !user.id || !projectId) {
        return ResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "GET":
            return getMethod(projectId, res);
    }
}

async function getMethod(projectId: any, res: NextApiResponse) {
    const project = await getProjectFromId(projectId);

    if (!project) {
        return ResponseAPI(res, 404, "Project with id " + projectId + " not found");
    }

    return ResponseAPI(res, 200, "", project);
}
