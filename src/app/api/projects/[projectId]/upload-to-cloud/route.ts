import { NextRequest } from "next/server";
import * as ProjectService from "@src/server/service/project-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { InternalServerError, SuccessCreated, validate } from "@src/lib/utils/api-utils";
import { requirePro } from "@src/lib/utils/pro-utils";

import z from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QuerySchema = z.object({
    projectId: z.string().regex(UUID_REGEX, "Invalid project id"),
});

const BodySchema = z.object({
    title: z.string().min(1).max(256),
    description: z.string().max(2048).optional(),
    author: z.string().max(256).optional(),
});

/**
 * POST `/projects/[projectId]/upload-to-cloud`
 *
 * Promotes a local-only project to a cloud project, reusing the supplied id.
 * Returns the freshly created membership so the client can hydrate ProjectContext.
 */
async function uploadProjectToCloud(req: NextRequest, { routeParams, user }: AuthApiContext) {
    await requirePro(user.id);

    const { projectId } = validate(QuerySchema, routeParams);
    const body = await req.json();
    const { title, description, author } = validate(BodySchema, body);

    await ProjectService.create({
        id: projectId,
        title,
        description,
        author,
        userId: user.id,
        hasPoster: false,
    });

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) {
        throw new InternalServerError();
    }

    return SuccessCreated(membership);
}

export const POST = apiHandler(uploadProjectToCloud);
