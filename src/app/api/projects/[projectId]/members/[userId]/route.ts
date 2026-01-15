import { ProjectRole } from "@prisma/client";
import { getCookieUser } from "@src/lib/session";
import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import {
    ForbiddenError,
    BodyFieldError,
    ProjectNotFoundError,
    Success,
    UnauthorizedError,
    SuccessNoContent,
    NotFoundError,
    validate,
} from "@src/lib/utils/api-utils";

import * as Roles from "@src/lib/utils/roles";
import * as ProjectService from "@src/server/service/project-service";
import * as CollabUtils from "@src/lib/collaboration/utils";

import z from "zod";
import { NextRequest } from "next/server";
import { redirect } from "@node_modules/next/navigation";

const QuerySchema = z.object({
    projectId: z.string(),
    userId: z.string(),
});

export type UpdateRoleBody = z.infer<typeof UpdateRoleSchema>;
const UpdateRoleSchema = z.object({
    role: z.string(),
});

/**
 * GET `/projects/[projectId]/members/[userId]`
 *
 * Returns a project member given its userId and associated projectId
 */
async function getProjectMember(req: NextRequest, { routeParams }: ApiContext) {
    // We query the user role for this poject, throw 404 in case it doesn't belong to it
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, cookie.id);
    if (!member) {
        throw new ProjectNotFoundError();
    }

    return Success(member);
}

/**
 * PATCH `/projects/[projectId]/members/[userId]`
 *
 * Updates a project member role
 */
async function updateProjectMemberRole(req: NextRequest, { routeParams }: ApiContext) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const body = await req.json();
    const { role } = validate(UpdateRoleSchema, body);
    const { userId: userToUpdateId, projectId } = validate(QuerySchema, routeParams);

    const isSelf = cookie.id === userToUpdateId;
    if (isSelf) throw new ForbiddenError("You cannot update your own role");

    if (!Roles.isValid(role)) throw new BodyFieldError("Unknown role");
    const newRole = role as ProjectRole;

    const member = await ProjectService.getMembership(projectId, cookie.id);
    if (!member) {
        throw new ProjectNotFoundError();
    }
    const memberToUpdate = await ProjectService.getMembership(projectId, userToUpdateId);
    if (!memberToUpdate) {
        throw new ProjectNotFoundError();
    }

    if (memberToUpdate.role === newRole) {
        return SuccessNoContent();
    }

    if (member.role === newRole) {
        throw new ForbiddenError("You cannot assign the same role to another user");
    }

    if (!Roles.hasRoleOrGreater(member.role, newRole) || !Roles.hasRoleOrGreater(member.role, memberToUpdate.role)) {
        throw new ForbiddenError("User does not have sufficient permissions");
    }

    const updated = await ProjectService.upsertMember(projectId, userToUpdateId, newRole);
    return Success(updated);
}

/**
 * DELETE `/projects/[projectId]/members/[userid]`
 *
 * Removes a member from a project. A user can leave the project itself.
 */
async function deleteProjectMember(req: NextRequest, { routeParams }: ApiContext) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const { userId: userToDelete, projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, cookie.id);
    if (!member) {
        throw new NotFoundError();
    }

    const isSelf = cookie.id === userToDelete;
    if (isSelf) {
        if (member.role !== ProjectRole.OWNER) {
            // No need to check roles, any non-owner member can leave the project on its own
            await ProjectService.deleteProjectMember(projectId, userToDelete);
            return Success({ redirectUrl: "/" });
        } else {
            // An owner cannot leave its project as a collaborator
            // He either needs to transfer ownership or delete project
            throw new ForbiddenError("Owner cannot leave project");
        }
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("User must be admin to kick another project member");
    }

    const memberToDelete = await ProjectService.getMembership(projectId, userToDelete);
    if (!memberToDelete) {
        throw new NotFoundError();
    }

    if (!Roles.hasRoleOrGreater(member.role, memberToDelete.role)) {
        throw new ForbiddenError("User does not have sufficient permissions");
    }

    await ProjectService.deleteProjectMember(projectId, userToDelete);
    await CollabUtils.blacklistFromWebsocket(userToDelete, projectId);

    return SuccessNoContent();
}

export const GET = apiHandler(getProjectMember);
export const PATCH = apiHandler(updateProjectMemberRole);
export const DELETE = apiHandler(deleteProjectMember);
