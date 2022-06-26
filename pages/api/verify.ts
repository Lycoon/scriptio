import { NextApiRequest, NextApiResponse } from "next";
import { VerificationStatus } from "../../src/lib/utils";
import {
    getSecretsFromId,
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

        if (!secrets || emailHash !== secrets.emailHash) {
            redirect(res, VerificationStatus.FAILED);
            return;
        }

        if (secrets.active) {
            redirect(res, VerificationStatus.USED);
            return;
        }

        const updated = await updateUser({ id: { id }, active: true });
        if (!updated) {
            redirect(res, VerificationStatus.FAILED);
            return;
        }

        redirect(res, VerificationStatus.SUCCESS);
    } catch (error: any) {
        redirect(res, VerificationStatus.FAILED);
    }
}
