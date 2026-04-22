import { NextRequest } from "next/server";
import z from "zod";

import * as ProjectService from "@src/server/service/project-service";
import { Success, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const ParamsSchema = z.object({ projectId: z.string().min(1) });

async function getProjectMembers(req: NextRequest, { routeParams, user }: AuthApiContext) {
    await assertAdmin(user);
    const { projectId } = validate(ParamsSchema, routeParams);

    const collaborators = await ProjectService.getCollaborators(projectId);
    return Success(collaborators);
}

export const GET = apiHandler(getProjectMembers);
