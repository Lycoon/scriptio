import { NextRequest, NextResponse } from "next/server";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { NotFoundError, ProjectNotFoundError, validate } from "@src/lib/utils/api-utils";

import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
    hash: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid asset hash"),
});

/**
 * GET `/projects/[projectId]/assets/[hash]`
 *
 * Streams a board asset's bytes through the (same-origin) API — the client caches
 * them in IndexedDB. Proxying keeps the bucket private and avoids R2 CORS setup.
 * Any project member (VIEWER+) may read.
 */
async function getAsset(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId, hash } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();

    const asset = await ProjectService.getAsset(projectId, hash);
    if (!asset) throw new NotFoundError("Asset not found");

    const bytes = await S3.getObjectBytes(`assets/${projectId}/${hash}`);
    if (!bytes) throw new NotFoundError("Asset not found");

    return new NextResponse(bytes as BodyInit, {
        headers: {
            "Content-Type": asset.mime,
            "Content-Length": String(asset.size),
            // Content-addressed: bytes for a hash never change.
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    });
}

export const GET = apiHandler(getAsset);
