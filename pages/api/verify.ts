import { NextApiRequest, NextApiResponse } from "next";
import { getUserFromId, updateUser } from "@src/server/service/user-service";
import { VerificationStatus } from "@src/lib/utils/enums";

const redirect = (res: NextApiResponse, status: VerificationStatus) => {
    const REDIRECTION = "/login?verificationStatus=";
    res.redirect(REDIRECTION + status);
};

export default async function verifyRoute(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (!req.query.id || !req.query.code) {
            // scriptio.app/api/verify?id=userId&code=emailHash
            return redirect(res, VerificationStatus.Failed);
        }

        const id = +req.query.id!;
        const emailHash = req.query.code;
        const user = await getUserFromId(id, true);

        if (!user || emailHash !== user.secrets.emailHash) {
            return redirect(res, VerificationStatus.Failed);
        }

        if (user.verified) {
            return redirect(res, VerificationStatus.Used);
        }

        const updated = await updateUser({ id: { id }, verified: true });
        if (!updated) {
            return redirect(res, VerificationStatus.Failed);
        }

        redirect(res, VerificationStatus.Success);
    } catch (error: any) {
        redirect(res, VerificationStatus.Failed);
    }
}
