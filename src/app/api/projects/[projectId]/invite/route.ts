import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ProjectRole } from "../../../../../generated/client/client";
import {
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    Success,
    SuccessCreated,
    SuccessNoContent,
    validate,
} from "@src/lib/utils/api-utils";
import { requirePro } from "@src/lib/utils/pro-utils";

import * as Mail from "@src/lib/mail/mail";
import * as ProjectService from "@src/server/service/project-service";
import * as Secrets from "@src/lib/utils/secrets";
import * as Roles from "@src/lib/utils/roles";

import z from "zod";
import { NextRequest } from "next/server";

const ProjectMemberEmailBodySchema = z.object({
    email: z.email(),
});

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * GET `/projects/[projectId]/invite`
 *
 * Returns the list of pending invites for this project
 */
async function getInvites(req: NextRequest, { routeParams }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const invites = await ProjectService.getInvites(projectId);
    return Success(invites);
}

/**
 * POST `/projects/[projectId]/invite`
 *
 * Invites a given user to a project, creating a pending `ProjectInvitation`
 */
async function inviteMember(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const body = await req.json();
    const { email: emailToInvite } = validate(ProjectMemberEmailBodySchema, body);
    const { projectId } = validate(QuerySchema, routeParams);

    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new NotFoundError();
    }
    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Only admin members can issue invites");
    }

    await requirePro(user.id);

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
    await Mail.sendProjectInviteEmail(emailToInvite, member.project.title, token);

    return SuccessCreated(invite);
}

/**
 * DELETE `/projects/[projectId]/invite`
 *
 * Deletes the invite associated to a given email address, removing its pending `ProjectInvitation`
 */
async function deleteInvite(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const body = await req.json();
    const { email: emailToDelete } = validate(ProjectMemberEmailBodySchema, body);
    const { projectId } = validate(QuerySchema, routeParams);

    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new NotFoundError();
    }
    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Only admin members can delete invites");
    }

    await ProjectService.deleteInviteFromEmail(emailToDelete, projectId);
    return SuccessNoContent();
}

export const GET = apiHandler(getInvites);
export const POST = apiHandler(inviteMember);
export const DELETE = apiHandler(deleteInvite);
