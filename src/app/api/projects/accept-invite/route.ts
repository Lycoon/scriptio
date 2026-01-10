import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { InternalServerError, NotFoundError, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as Misc from "@src/lib/utils/misc";

import z from "zod";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

const QuerySchema = z.object({
    token: z.string(),
});

/**
 * GET `/projects/accept-invite`
 *
 * Adds the user as a member to the project associated to the token
 */
async function acceptProjectInvite(req: NextRequest, { searchParams }: ApiContext) {
    const { token } = validate(QuerySchema, searchParams);

    const invite = await ProjectService.getInvite(token);
    if (!invite) {
        throw new NotFoundError();
    }

    if (Misc.hasExpired(invite.createdAt, 7, "days")) {
        throw new InternalServerError("Invite has expired");
    }

    const user = await UserService.getUserFromEmail(invite.email);
    if (user) {
        // If user exists, we can add him as a project member
        await ProjectService.upsertMember(invite.projectId, user.id);
        await ProjectService.deleteInviteFromToken(token);
        redirect(`/projects/${invite.projectId}/screenplay`);
    } else {
        // If email is not registered on Scriptio we redirect to signup with the same token
        redirect(`/signup?email=${invite.email}&inviteToken=${token}`);
    }
}

export const GET = apiHandler(acceptProjectInvite);
