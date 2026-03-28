import { ProjectRole } from "@prisma/client";
import { getCookieUser } from "@src/lib/session";
import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { ForbiddenError, getCollabHttpUrl, Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import * as Roles from "@src/lib/utils/roles";
import * as ProjectService from "@src/server/service/project-service";

import jwt from "jsonwebtoken";
import z from "zod";
import { NextRequest } from "next/server";

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * Helper to create a signed JWT for Worker auth and forward a request to the collaboration Worker.
 */
async function forwardToWorker(projectId: string, method: string, path: string, body?: any): Promise<Response> {
    const token = jwt.sign({ type: "admin-action", projectId }, process.env.JWT_SECRET!, { expiresIn: "1m" });

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
async function listSaves(req: NextRequest, { routeParams }: ApiContext) {
    const user = await getCookieUser();
    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

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
async function deleteSave(req: NextRequest, { routeParams }: ApiContext) {
    const user = await getCookieUser();
    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

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
