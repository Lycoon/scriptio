import { ProjectRole } from "@prisma/client";
import { getCookieUser } from "@src/lib/session";
import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { ForbiddenError, getCollabHttpUrl, Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

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
    body?: any
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
 * POST `/projects/[projectId]/saves/restore`
 *
 * Restores a save by key. Requires ADMIN+ role.
 * This replaces the live document for all connected collaborators.
 */
async function restoreSave(req: NextRequest, { routeParams }: ApiContext) {
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
        throw new ForbiddenError("Insufficient permissions to restore saves");
    }

    const body = await req.json();
    const res = await forwardToWorker(projectId, "POST", "/saves/restore", body);

    if (!res.ok) {
        const text = await res.text();
        throw new ForbiddenError(text);
    }

    return Success(null);
}

export const POST = apiHandler(restoreSave);
