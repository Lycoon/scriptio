import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import {
    ForbiddenError,
    NotFoundError,
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
import { ProjectRole } from "@node_modules/.prisma/client";

type Body = z.infer<typeof BodySchema>;
const BodySchema = z.object({
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

    const body = validate(BodySchema, req.body);
    switch (req.method) {
        case "POST":
            return inviteMember(user.id, query, body, res);
        case "DELETE":
            return deleteInvite(user.id, query, body, res);
    }
}

/**
 * POST `/projects/[projectId]/invite`
 *
 * Invites a given user to a project, creating a pending `ProjectInvitation`
 */
async function inviteMember(userId: number, query: Query, body: Body, res: NextApiResponse) {
    const { email: emailToInvite } = body;
    const { projectId } = query;

    const member = await ProjectService.getMember(projectId, userId, true);
    if (!member) {
        throw new NotFoundError();
    }
    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.ADMIN)) {
        throw new ForbiddenError("Only admin members can issue invites");
    }

    const token = Secrets.generateHexToken();
    const invite = await ProjectService.createInvite(projectId, emailToInvite, token);
    Mail.sendProjectInviteEmail(emailToInvite, member.project.title, token);

    return SuccessCreated(res, invite);
}

/**
 * DELETE `/projects/[projectId]/invite`
 *
 * Deletes the invite associated to a given email address, removing its pending `ProjectInvitation`
 */
async function deleteInvite(userId: number, query: Query, body: Body, res: NextApiResponse) {
    const { email: emailToDelete } = body;
    const { projectId } = query;

    const member = await ProjectService.getMember(projectId, userId, true);
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
