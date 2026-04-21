import { ProjectRole } from "@prisma/client";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import {
    ForbiddenError,
    getCollabHttpUrl,
    Success,
    SuccessCreated,
    validate,
} from "@src/lib/utils/api-utils";
import { requirePro } from "@src/lib/utils/pro-utils";

import * as Roles from "@src/lib/utils/roles";
import * as ProjectService from "@src/server/service/project-service";

import { SignJWT } from "jose";
import z from "zod";
import { NextRequest } from "next/server";

const QuerySchema = z.object({
    projectId: z.string(),
});

async function forwardToWorker(
    projectId: string,
    method: string,
    path: string,
    body?: unknown,
): Promise<Response> {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ type: "admin-action", projectId })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1m")
        .sign(secret);

    const url = getCollabHttpUrl(`/${projectId}${path}`);
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    return res;
}

/**
 * POST `/projects/[projectId]/saves/manual`
 *
 * Creates a manual save with a user-provided name.
 * Requires EDITOR+ role.
 */
async function createManualSave(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ForbiddenError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.EDITOR)) {
        throw new ForbiddenError("Insufficient permissions to create saves");
    }

    await requirePro(user.id);

    const body = await req.json();
    const res = await forwardToWorker(projectId, "POST", "/saves/manual", body);

    if (!res.ok) {
        const text = await res.text();
        throw new ForbiddenError(text);
    }

    const data = await res.json();
    return SuccessCreated(data);
}

/**
 * PATCH `/projects/[projectId]/saves/manual`
 *
 * Renames a manual save. Requires ADMIN+ role.
 */
async function renameManualSave(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ForbiddenError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Insufficient permissions to rename saves");
    }

    const body = await req.json();
    const res = await forwardToWorker(projectId, "PATCH", "/saves/manual", body);

    if (!res.ok) {
        const text = await res.text();
        throw new ForbiddenError(text);
    }

    return Success(null);
}

export const POST = apiHandler(createManualSave);
export const PATCH = apiHandler(renameManualSave);
