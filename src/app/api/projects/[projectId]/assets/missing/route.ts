import { NextRequest } from "next/server";
import { ProjectRole } from "../../../../../../generated/client/client";

import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ForbiddenError, ProjectNotFoundError, Success, validate } from "@src/lib/utils/api-utils";

import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
});

const BodySchema = z.object({
    hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/i)).max(100000),
});

/**
 * POST `/projects/[projectId]/assets/missing`
 *
 * Given candidate hashes (assets the client has locally), returns those the cloud
 * isn't tracking yet — i.e. that still need uploading (e.g. added while offline).
 * Requires EDITOR+.
 */
async function missingAssets(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();
    if (!Roles.hasRoleOrGreater(membership.role, ProjectRole.EDITOR)) throw new ForbiddenError();

    const { hashes } = validate(BodySchema, await req.json());
    const existing = new Set(await ProjectService.getExistingAssetHashes(projectId, hashes));
    const missing = hashes.filter((hash) => !existing.has(hash));

    return Success({ missing });
}

export const POST = apiHandler(missingAssets);
