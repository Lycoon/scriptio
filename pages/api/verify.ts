import { NextApiRequest, NextApiResponse } from "next";
import { VerificationStatus } from "../../src/lib/utils";
import {
    getSecretsFromId,
    getUserFromId,
    updateUser,
} from "../../src/server/service/user-service";

const REDIRECTION = "/login?verificationStatus=";
const redirect = (res: NextApiResponse, status: VerificationStatus) => {
    res.redirect(REDIRECTION + status);
};

export default async function verify(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        if (!req.query.id || !req.query.code) {
            // scriptio.app/api/verify?id=userId&code=emailHash
            redirect(res, VerificationStatus.FAILED);
        }

        const id = +req.query.id;
        const emailHash = req.query.code;
        const secrets = await getSecretsFromId(id);
        const user = await getUserFromId(id);

        if (!secrets || !user || emailHash !== secrets.emailHash) {
            redirect(res, VerificationStatus.FAILED);
            return;
        }

        if (user.verified) {
            redirect(res, VerificationStatus.USED);
            return;
        }

        const updated = await updateUser({ id: { id }, verified: true });
        if (!updated) {
            redirect(res, VerificationStatus.FAILED);
            return;
        }

        redirect(res, VerificationStatus.SUCCESS);
    } catch (error: any) {
        redirect(res, VerificationStatus.FAILED);
    }
}
