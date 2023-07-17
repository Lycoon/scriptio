import { withIronSessionApiRoute } from "iron-session/next";
import { NextApiRequest, NextApiResponse } from "next";
import { sessionOptions } from "@src/lib/session";
import { getProjectFromId } from "@src/server/service/project-service";
import { onResponseAPI } from "@src/lib/utils/requests";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = req.session.user;
    const projectId = req.query["projectId"];
    if (!user || !user.isLoggedIn || !user.id || !projectId) {
        return onResponseAPI(res, 403, "Forbidden");
    }

    switch (req.method) {
        case "GET":
            return getMethod(projectId, res);
    }
}

async function getMethod(projectId: any, res: NextApiResponse) {
    const project = await getProjectFromId(projectId);

    if (!project) {
        return onResponseAPI(res, 404, "Project with id " + projectId + " not found");
    }

    return onResponseAPI(res, 200, "", project);
}
