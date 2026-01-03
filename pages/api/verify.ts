import { NextApiRequest, NextApiResponse } from "next";
import { VerificationStatus } from "@src/lib/utils/enums";
import { apiHandler } from "@src/lib/utils/api-handler";

import { validate } from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import z from "zod";
import { getSession } from "@src/lib/session";

const QuerySchema = z.object({
    id: z.string(),
    token: z.string(),
});

const redirect = (res: NextApiResponse, status: VerificationStatus) => {
    const REDIRECTION = "/login?verificationStatus=";
    res.redirect(REDIRECTION + status);
};

/**
 * GET `/verify`
 *
 * Verifies a user that just registered and clicked the link in validation mail
 * scriptio.app/api/verify?id=userId&token=emailHash
 */
async function verifyUser(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { id, token } = validate(QuerySchema, req.query);

        const user = await UserService.getUserFromId(id, true);
        if (!user || token !== user.secrets?.emailHash) {
            return redirect(res, VerificationStatus.Failed);
        }

        if (user.verified) {
            return redirect(res, VerificationStatus.Used);
        }

        const updated = await UserService.updateUserFromId(id, {
            secrets: { emailHash: null },
            verified: true,
        });

        if (!updated) {
            return redirect(res, VerificationStatus.Failed);
        }

        // Automatically authenticate a user that just clicked on his verification email
        const session = await getSession(req, res);
        session.id = user.id;
        session.email = user.email;
        await session.save();

        res.redirect("/");
    } catch (error: any) {
        redirect(res, VerificationStatus.Failed);
    }
}

export default apiHandler(verifyUser);
