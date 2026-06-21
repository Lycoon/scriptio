import { NextRequest } from "next/server";
import { ProjectRole } from "../../../../../generated/client/client";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import {
    BodyFieldError,
    ForbiddenError,
    InternalServerError,
    ProjectNotFoundError,
    StorageQuotaExceededError,
    Success,
    SuccessCreated,
    validate,
} from "@src/lib/utils/api-utils";
import { requirePro } from "@src/lib/utils/pro-utils";
import { sha256Hex } from "@src/lib/assets/asset-hash";
import { MAX_ASSET_SIZE_BYTES, USER_STORAGE_QUOTA_BYTES } from "@src/lib/utils/storage-limits";

import z from "zod";

const ParamsSchema = z.object({
    projectId: z.string(),
});

const QuerySchema = z.object({
    projectId: z.string(),
    hash: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid asset hash"),
    mime: z.string().min(1).max(128),
    w: z.coerce.number().int().min(0).default(0),
    h: z.coerce.number().int().min(0).default(0),
});

/**
 * GET `/projects/[projectId]/assets`
 *
 * Lists the project's tracked assets (hash, mime, size, dimensions) for the
 * Storage dashboard. Any project member (VIEWER+) may read.
 */
async function listAssets(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(ParamsSchema, routeParams);

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();

    const assets = await ProjectService.getProjectAssets(projectId);
    return Success({ assets });
}

/**
 * POST `/projects/[projectId]/assets?hash=&mime=&w=&h=`
 *
 * Uploads a board asset (image / audio) to R2 at `assets/{projectId}/{hash}` and
 * records a tracking row. Body is the raw bytes. Idempotent: an already-stored
 * hash returns `{ deduped: true }` without re-charging the owner's quota.
 */
async function uploadAsset(req: NextRequest, { routeParams, searchParams, user }: AuthApiContext) {
    const { projectId, hash, mime, w, h } = validate(QuerySchema, { ...routeParams, ...searchParams });

    const membership = await ProjectService.getMembership(projectId, user.id);
    if (!membership) throw new ProjectNotFoundError();
    if (!Roles.hasRoleOrGreater(membership.role, ProjectRole.EDITOR)) throw new ForbiddenError();

    const ownerId = await ProjectService.getProjectOwnerId(projectId);
    if (!ownerId) throw new InternalServerError();
    await requirePro(ownerId);

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) throw new BodyFieldError("Empty asset body");
    if (bytes.byteLength > MAX_ASSET_SIZE_BYTES) throw new BodyFieldError("Asset exceeds maximum size");

    // Integrity: the bytes must match the claimed content-addressed hash.
    const actualHash = await sha256Hex(bytes.buffer as ArrayBuffer);
    if (actualHash !== hash.toLowerCase()) throw new BodyFieldError("Asset hash mismatch");

    // Dedup: identical bytes already tracked for this project — no upload, no recharge.
    const existing = await ProjectService.getAsset(projectId, hash);
    if (existing) return SuccessCreated({ deduped: true });

    // Quota: owner-centric, summed across every project they own.
    const used = await ProjectService.getOwnerStorageUsed(ownerId);
    if (used + bytes.byteLength > USER_STORAGE_QUOTA_BYTES) throw new StorageQuotaExceededError();

    const ok = await S3.putObject(`assets/${projectId}/${hash}`, bytes, mime);
    if (!ok) throw new InternalServerError();

    try {
        await ProjectService.createAsset({
            projectId,
            hash,
            mime,
            size: bytes.byteLength,
            width: w,
            height: h,
        });
    } catch {
        // A concurrent upload of the same hash won the unique constraint — the
        // object is in R2 (same key, same bytes) and tracked. Treat as deduped.
        return SuccessCreated({ deduped: true });
    }

    return SuccessCreated({ deduped: false });
}

export const GET = apiHandler(listAssets);
export const POST = apiHandler(uploadAsset);
