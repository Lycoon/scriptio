import { NextApiRequest, NextApiResponse } from "next";
import { apiHandler } from "@src/lib/utils/api-handler";
import { InternalServerError, NotFoundError, Success, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as Misc from "@src/lib/utils/misc";

import z from "zod";

type Query = z.infer<typeof QuerySchema>;
const QuerySchema = z.object({
    token: z.string(),
});

async function acceptInviteRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    switch (req.method) {
        case "GET":
            return acceptProjectInvite(query, res);
    }
}

/**
 * GET `/projects/accept-invite`
 *
 * Adds the user as a member to the project associated to the token
 */
async function acceptProjectInvite(query: Query, res: NextApiResponse) {
    const { token } = query;

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
        const projectUser = await ProjectService.upsertMember(invite.projectId, user.id);
        await ProjectService.deleteInviteFromToken(token);
        return Success(res, projectUser);
    } else {
        // If email is not registered on Scriptio we redirect to signup with the same token
        res.redirect(`/signup?email=${invite.email}&inviteToken=${token}`);
    }
}

export default apiHandler(acceptInviteRoute);
