import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { ProjectRole } from "@prisma/client";
import {
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    Success,
    SuccessCreated,
    SuccessNoContent,
    UnauthorizedError,
    validate,
} from "@src/lib/utils/api-utils";

import * as Mail from "@src/lib/mail/mail";
import * as ProjectService from "@src/server/service/project-service";
import * as Secrets from "@src/lib/utils/secrets";
import * as Roles from "@src/lib/utils/roles";

import z from "zod";

type ProjectMemberEmailBody = z.infer<typeof ProjectMemberEmailBodySchema>;
const ProjectMemberEmailBodySchema = z.object({
    email: z.email(),
});

type Query = z.infer<typeof QuerySchema>;
const QuerySchema = z.object({
    projectId: z.string(),
});

async function inviteMemberRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    const user = await getCookieUser(req, res);
    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getInvites(user.id, query, res);
        case "POST":
            const inviteBody = validate(ProjectMemberEmailBodySchema, req.body);
            return inviteMember(user.id, query, inviteBody, res);
        case "DELETE":
            const deleteBody = validate(ProjectMemberEmailBodySchema, req.body);
            return deleteInvite(user.id, query, deleteBody, res);
    }
}

/**
 * GET `/projects/[projectId]/invite`
 *
 * Returns the list of pending invites for this project
 */
async function getInvites(userId: string, query: Query, res: NextApiResponse) {
    const { projectId } = query;

    const invites = await ProjectService.getInvites(projectId);
    return Success(res, invites);
}

/**
 * POST `/projects/[projectId]/invite`
 *
 * Invites a given user to a project, creating a pending `ProjectInvitation`
 */
async function inviteMember(userId: string, query: Query, body: ProjectMemberEmailBody, res: NextApiResponse) {
    const { email: emailToInvite } = body;
    const { projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new NotFoundError();
    }
    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Only admin members can issue invites");
    }

    const invites = await ProjectService.getInvites(projectId);
    const isAlreadyInvited = invites.some((i) => i.email === emailToInvite);
    if (isAlreadyInvited) {
        throw new ForbiddenError("User is already invited");
    }

    const members = await ProjectService.getCollaborators(projectId);
    const isAlreadyMember = members.some((m) => m.user.email === emailToInvite);
    if (isAlreadyMember) {
        throw new ForbiddenError("User is already part of the project");
    }

    if (invites.length + members.length >= 6) {
        throw new InternalServerError("Project has reached maximum capacity of collaborators");
    }

    const token = Secrets.generateToken();
    const invite = await ProjectService.createInvite(projectId, emailToInvite, token);
    Mail.sendProjectInviteEmail(emailToInvite, member.project.title, token);

    return SuccessCreated(res, invite);
}

/**
 * DELETE `/projects/[projectId]/invite`
 *
 * Deletes the invite associated to a given email address, removing its pending `ProjectInvitation`
 */
async function deleteInvite(userId: string, query: Query, body: ProjectMemberEmailBody, res: NextApiResponse) {
    const { email: emailToDelete } = body;
    const { projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new NotFoundError();
    }
    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Only admin members can delete invites");
    }

    await ProjectService.deleteInviteFromEmail(emailToDelete, projectId);
    return SuccessNoContent(res);
}

export default apiHandler(inviteMemberRoute);
