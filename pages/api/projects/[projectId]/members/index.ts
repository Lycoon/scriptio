import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { ProjectNotFoundError, Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";

import z from "zod";

type Query = z.infer<typeof QuerySchema>;
const QuerySchema = z.object({
    projectId: z.string(),
});

async function projectRoleRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getProjectMemberships(user.id, query, res);
    }
}

/**
 * GET `/projects/[projectId]/members`
 *
 * Returns project memberships associated projectId
 */
async function getProjectMemberships(userId: number, query: Query, res: NextApiResponse) {
    const { projectId } = query;

    const collaborators = await ProjectService.getCollaborators(projectId);
    if (!collaborators) {
        throw new ProjectNotFoundError();
    }

    return Success(res, collaborators);
}

export default apiHandler(projectRoleRoute);
