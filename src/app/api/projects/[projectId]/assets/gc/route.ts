import { NextRequest } from "next/server";
import { ProjectRole } from "../../../../../../generated/client/client";

import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ForbiddenError, getCollabHttpUrl, ProjectNotFoundError, Success, validate } from "@src/lib/utils/api-utils";
import { reconcileProjectAssets } from "@src/server/service/asset-gc-service";

import { SignJWT } from "jose";
import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
});

/** Ask the collaboration Worker for the asset hashes referenced by the live doc
 *  and every retained snapshot (served from its index — cheap). */
async function fetchReferencedHashes(projectId: string): Promise<{ hashes: string[]; complete: boolean }> {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ type: "admin-action", projectId })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1m")
        .sign(secret);

    const res = await fetch(getCollabHttpUrl(`/${projectId}/asset-refs`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Worker error computing asset refs: ${await res.text()}`);
    return (await res.json()) as { hashes: string[]; complete: boolean };
}

/**
 * POST `/projects/[projectId]/assets/gc`
 *
 * User-triggered reconcile (runs once on project open). Pulls the authoritative
 * referenced set from the Worker and deletes orphaned cloud assets. The Worker
 * also drives this autonomously after retention prunes snapshots. Requires EDITOR+.
 */
async function gcAssets(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();
    if (!Roles.hasRoleOrGreater(membership.role, ProjectRole.EDITOR)) throw new ForbiddenError();

    const { hashes, complete } = await fetchReferencedHashes(projectId);
    const deleted = await reconcileProjectAssets(projectId, hashes, complete);

    return Success({ deleted, skipped: !complete });
}

export const POST = apiHandler(gcAssets);
