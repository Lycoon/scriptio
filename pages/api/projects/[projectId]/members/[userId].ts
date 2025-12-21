import { ProjectRole } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
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

import z from "zod";

type Query = z.infer<typeof QuerySchema>;
const QuerySchema = z.object({
    projectId: z.string(),
    userId: z.coerce.number().int().positive(),
});

export type UpdateRoleBody = z.infer<typeof UpdateRoleSchema>;
const UpdateRoleSchema = z.object({
    role: z.string(),
});

async function projectRoleRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getProjectMember(user.id, query, res);
        case "PATCH":
            const body = validate(UpdateRoleSchema, req.body);
            return updateProjectMemberRole(user.id, query, body, res);
        case "DELETE":
            return deleteProjectMember(user.id, query, res);
    }
}

/**
 * GET `/projects/[projectId]/members/[userid]`
 *
 * Returns a project member given its userId and associated projectId
 */
async function getProjectMember(userId: number, query: Query, res: NextApiResponse) {
    // We query the user role for this poject, throw 404 in case it doesn't belong to it
    const { projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new ProjectNotFoundError();
    }

    return Success(res, member);
}

/**
 * PATCH `/projects/[projectId]/members/[userid]`
 *
 * Updates a project member role
 */
async function updateProjectMemberRole(userId: number, query: Query, body: UpdateRoleBody, res: NextApiResponse) {
    const { role } = body;
    const { userId: userToUpdateId, projectId } = query;

    if (!Roles.isValid(role)) throw new BodyFieldError("Unknown role");
    const newRole = role as ProjectRole;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new ProjectNotFoundError();
    }
    const memberToUpdate = await ProjectService.getMembership(projectId, userToUpdateId);
    if (!memberToUpdate) {
        throw new ProjectNotFoundError();
    }

    if (memberToUpdate.role === newRole) {
        return SuccessNoContent(res);
    }

    if (
        member.role === memberToUpdate.role ||
        !Roles.hasRoleOrGreater(member.role, newRole) ||
        !Roles.hasRoleOrGreater(member.role, memberToUpdate.role)
    ) {
        throw new ForbiddenError("User does not have sufficient permissions");
    }

    const updated = await ProjectService.upsertMember(projectId, userToUpdateId, newRole);
    return Success(res, updated);
}

/**
 * DELETE `/projects/[projectId]/members/[userid]`
 *
 * Removes a member from a project. A user can leave the project itself
 */
async function deleteProjectMember(userId: number, query: Query, res: NextApiResponse) {
    const { userId: userToDelete, projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new NotFoundError();
    }

    const isSelf = userId === userToDelete;
    if (isSelf && member.role !== ProjectRole.OWNER) {
        // An owner cannot leave its project as a collaborator, he either needs to transfer ownership or delete project
        await ProjectService.deleteProjectMember(projectId, userToDelete);
        return SuccessNoContent(res);
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("User must be admin to kick another project member");
    }

    const memberToDelete = await ProjectService.getMembership(projectId, userToDelete);
    if (!memberToDelete) {
        throw new NotFoundError();
    }

    if (member.role === memberToDelete.role) {
        throw new ForbiddenError("Project member of same role cannot be deleted");
    }

    if (!Roles.hasRoleOrGreater(member.role, memberToDelete.role)) {
        throw new ForbiddenError("User does not have sufficient permissions");
    }

    await ProjectService.deleteProjectMember(projectId, userToDelete);
    return SuccessNoContent(res);
}

export default apiHandler(projectRoleRoute);
