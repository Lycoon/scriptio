import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { InternalServerError, NotFoundError, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as Misc from "@src/lib/utils/misc";
import * as CollabUtils from "@src/lib/cloud/utils";

import z from "zod";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { getCookieUser } from "@src/lib/session";
import { redirectScreenplay } from "@src/lib/utils/redirects";

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

        // The DO keeps a blacklist of kicked userIds (persisted in SQLite).
        // If this user was previously kicked from this project, the entry is
        // still there and would reject their next WS upgrade with 403. Clear
        // it now so the re-invite actually grants access.
        try {
            await CollabUtils.allowOnWebsocket(user.id, invite.projectId);
        } catch (err) {
            console.error("[accept-invite] Failed to clear blacklist:", err);
        }

        // If user is not logged in, send them to the home page with the email pre-filled
        // so they can request a magic link.
        const cookieUser = await getCookieUser();
        if (cookieUser) redirectScreenplay(invite.projectId);
        else redirect(`/?email=${encodeURIComponent(invite.email)}`);
    } else {
        // Unknown email — pre-fill the home page with email + invite token; the magic link
        // route will pick the invite token up from the request body and accept it on sign-in.
        redirect(`/?email=${encodeURIComponent(invite.email)}&inviteToken=${encodeURIComponent(token)}`);
    }
}

export const GET = apiHandler(acceptProjectInvite);
