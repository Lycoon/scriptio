import { NextRequest } from "next/server";
import z from "zod";

import * as ProjectService from "@src/server/service/project-service";
import { Success, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const ParamsSchema = z.object({ userId: z.string().min(1) });

async function getUserProjects(req: NextRequest, { routeParams, user }: AuthApiContext) {
    await assertAdmin(user);
    const { userId } = validate(ParamsSchema, routeParams);

    const memberships = await ProjectService.getMemberships(userId);
    return Success(memberships ?? []);
}

export const GET = apiHandler(getUserProjects);
