import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";

import { validate } from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import z from "zod";
import { authenticate } from "@src/lib/session";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { CookieUser } from "@src/lib/utils/types";

const QuerySchema = z.object({
    id: z.string(),
    token: z.string(),
});

/**
 * GET `/verify`
 *
 * Verifies a user that just registered and clicked the link in validation mail
 * scriptio.app/api/verify?id=userId&token=emailHash
 */
async function verifyUser(req: NextRequest, { searchParams }: ApiContext) {
    let target = "/login?status=failed";

    try {
        const { id, token } = validate(QuerySchema, searchParams);

        const user = await UserService.getUserFromId(id, true);
        if (!user || token !== user.secrets?.emailHash) {
            // target stays "/login?status=failed"
        } else if (user.verified) {
            target = "/login?status=used";
        } else {
            const updated = await UserService.updateUserFromId(id, {
                secrets: { emailHash: null },
                verified: true,
            });

            if (updated) {
                // Automatically authenticate a user that just clicked on his verification email
                await authenticate(updated as CookieUser);
                target = "/";
            }
        }
    } catch {
        target = "/login?status=failed";
    }

    redirect(target);
}

export const GET = apiHandler(verifyUser);
