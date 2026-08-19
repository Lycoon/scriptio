import { NextRequest, NextResponse } from "next/server";
import { ProjectRole } from "../../../../../generated/client/client";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import {
    BodyFieldError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    ProjectNotFoundError,
    Success,
    validate,
} from "@src/lib/utils/api-utils";
import { MAX_POSTER_SIZE_BYTES } from "@src/lib/utils/storage-limits";

import z from "zod";

const QuerySchema = z.object({
    projectId: z.string(),
});

/** Posters are always JPEG: the client re-encodes whatever the user picked, and
 *  the GET below advertises this type for every stored poster. */
const POSTER_MIME = "image/jpeg";

const posterKey = (projectId: string) => `poster-${projectId}`;

/**
 * GET `/projects/[projectId]/poster`
 *
 * Streams the project's poster through the (same-origin) API — the client
 * caches the bytes in IndexedDB so the poster renders offline too. Proxying
 * keeps the bucket private and avoids R2 CORS setup. Any member (VIEWER+) reads.
 */
async function getPoster(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();
    if (!membership.project.hasPoster) throw new NotFoundError("Poster not found");

    const bytes = await S3.getObjectBytes(posterKey(projectId));
    if (!bytes) throw new NotFoundError("Poster not found");

    return new NextResponse(bytes as BodyInit, {
        headers: {
            "Content-Type": POSTER_MIME,
            "Content-Length": String(bytes.byteLength),
            // A poster is replaced in place at a fixed key, so it must never be
            // served from a stale cache — freshness is the client's IndexedDB copy.
            "Cache-Control": "private, no-store",
        },
    });
}

/**
 * PUT `/projects/[projectId]/poster`
 *
 * Replaces the project's poster. Body is the raw image bytes (the client
 * re-encodes to a 600x900 JPEG first). EDITOR+ only. Posters are one small
 * fixed-size object per project, so they are not metered against the owner's
 * asset quota.
 */
async function putPoster(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();
    if (!Roles.hasRoleOrGreater(membership.role, ProjectRole.EDITOR)) throw new ForbiddenError();

    if (req.headers.get("Content-Type") !== POSTER_MIME) {
        throw new BodyFieldError("Poster must be a JPEG image");
    }

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) throw new BodyFieldError("Empty poster body");
    if (bytes.byteLength > MAX_POSTER_SIZE_BYTES) throw new BodyFieldError("Poster exceeds maximum size");

    const ok = await S3.putObject(posterKey(projectId), bytes, POSTER_MIME);
    if (!ok) throw new InternalServerError();

    const updated = await ProjectService.update({ projectId, hasPoster: true });
    if (!updated) throw new InternalServerError();

    return Success({ hasPoster: true });
}

export const GET = apiHandler(getPoster);
export const PUT = apiHandler(putPoster);
