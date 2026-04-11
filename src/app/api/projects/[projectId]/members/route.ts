import { getCookieUser } from "@src/lib/session";
import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { ProjectNotFoundError, Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";

import z from "zod";
import { NextRequest } from "next/server";

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * GET `/projects/[projectId]/members`
 *
 * Returns project memberships associated projectId
 */
async function getProjectMemberships(req: NextRequest, { routeParams }: ApiContext) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const { projectId } = validate(QuerySchema, routeParams);
    const collaborators = await ProjectService.getCollaborators(projectId);
    if (!collaborators) {
        throw new ProjectNotFoundError();
    }

    return Success(collaborators);
}

export const GET = apiHandler(getProjectMemberships);
