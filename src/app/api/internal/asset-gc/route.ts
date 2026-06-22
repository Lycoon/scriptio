import { NextRequest } from "next/server";

import { apiHandler } from "@src/lib/utils/api-handler";
import { Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";
import { reconcileProjectAssets } from "@src/server/service/asset-gc-service";

import { jwtVerify } from "jose";
import z from "zod";

const BodySchema = z.object({
    projectId: z.string(),
    referenced: z.array(z.string()),
    complete: z.boolean(),
});

/**
 * POST `/api/internal/asset-gc`
 *
 * Worker→app callback fired after the DurableObject prunes snapshots, so orphaned
 * R2 assets are reclaimed without waiting for a project reopen. Authenticated by a
 * short-lived Worker-signed JWT (`type: "asset-gc"`), not a user session — it's in
 * the proxy's public allowlist and verifies the token itself.
 */
async function internalAssetGc(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedError();

    let type: unknown;
    let tokenProjectId: unknown;
    try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!));
        type = payload.type;
        tokenProjectId = payload.projectId;
    } catch {
        throw new UnauthorizedError();
    }
    if (type !== "asset-gc") throw new UnauthorizedError();

    const { projectId, referenced, complete } = validate(BodySchema, await req.json());
    if (tokenProjectId !== projectId) throw new UnauthorizedError();

    const deleted = await reconcileProjectAssets(projectId, referenced, complete);
    return Success({ deleted });
}

export const POST = apiHandler(internalAssetGc);
