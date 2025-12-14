import { NextApiRequest, NextApiResponse } from "next";
import { VerificationStatus } from "@src/lib/utils/enums";
import { apiHandler } from "@src/lib/utils/api-handler";

import * as UserService from "@src/server/service/user-service";

const redirect = (res: NextApiResponse, status: VerificationStatus) => {
    const REDIRECTION = "/login?verificationStatus=";
    res.redirect(REDIRECTION + status);
};

async function verifyRoute(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (!req.query.id || !req.query.token) {
            // scriptio.app/api/verify?id=userId&token=emailHash
            return redirect(res, VerificationStatus.Failed);
        }

        const id = +req.query.id!;
        const emailHash = req.query.token;
        const user = await UserService.getUserFromId(id, true);

        if (!user || emailHash !== user.secrets.emailHash) {
            return redirect(res, VerificationStatus.Failed);
        }

        if (user.verified) {
            return redirect(res, VerificationStatus.Used);
        }

        const updated = await UserService.updateUser({ id: { id }, verified: true });
        if (!updated) {
            return redirect(res, VerificationStatus.Failed);
        }

        redirect(res, VerificationStatus.Success);
    } catch (error: any) {
        redirect(res, VerificationStatus.Failed);
    }
}

export default apiHandler(verifyRoute);
