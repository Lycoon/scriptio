import { NextRequest } from "next/server";

import * as ProjectService from "@src/server/service/project-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { InternalServerError, ProjectNotFoundError, Success, validate } from "@src/lib/utils/api-utils";
import { USER_STORAGE_QUOTA_BYTES } from "@src/lib/utils/storage-limits";

import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * GET `/projects/[projectId]/storage`
 *
 * Storage usage for the navbar panel: this project's bytes, the owner's total
 * across all of their projects, and the quota. Any member (VIEWER+) may read.
 */
async function getStorage(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();

    const ownerId = await ProjectService.getProjectOwnerId(projectId);
    if (!ownerId) throw new InternalServerError();

    const [projectUsed, ownerTotalUsed] = await Promise.all([
        ProjectService.getProjectStorageUsed(projectId),
        ProjectService.getOwnerStorageUsed(ownerId),
    ]);

    return Success({ projectUsed, ownerTotalUsed, quota: USER_STORAGE_QUOTA_BYTES });
}

export const GET = apiHandler(getStorage);
