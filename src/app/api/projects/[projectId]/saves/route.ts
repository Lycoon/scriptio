import { ProjectRole } from "@prisma/client";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ForbiddenError, getCollabHttpUrl, Success, validate } from "@src/lib/utils/api-utils";

import * as Roles from "@src/lib/utils/roles";
import * as ProjectService from "@src/server/service/project-service";

import { SignJWT } from "jose";
import z from "zod";
import { NextRequest } from "next/server";

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * Helper to create a signed JWT for Worker auth and forward a request to the collaboration Worker.
 */
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
 * GET `/projects/[projectId]/saves`
 *
 * Lists all saves (auto + manual) for a project.
 * Requires EDITOR+ role.
 */
async function listSaves(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ForbiddenError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.EDITOR)) {
        throw new ForbiddenError("Insufficient permissions to view saves");
    }

    const res = await forwardToWorker(projectId, "GET", "/saves");
    const data = await res.json();
    return Success(data);
}

/**
 * DELETE `/projects/[projectId]/saves`
 *
 * Deletes a save. Requires ADMIN+ role.
 */
async function deleteSave(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ForbiddenError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Insufficient permissions to delete saves");
    }

    const body = await req.json();
    const res = await forwardToWorker(projectId, "DELETE", "/saves", body);

    if (!res.ok) {
        const text = await res.text();
        throw new ForbiddenError(text);
    }

    return Success(null);
}

export const GET = apiHandler(listSaves);
export const DELETE = apiHandler(deleteSave);
