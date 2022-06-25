import { NextApiRequest, NextApiResponse } from "next";
import { ERROR_VERIFYING } from "../../src/lib/messages";
import { onError, onSuccess } from "../../src/lib/utils";
import {
    getSecretsFromId,
    updateUser,
} from "../../src/server/service/user-service";

export default async function verify(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        if (!req.query.id || !req.query.code) {
            // scriptio.app/api/verify?id=userId?code=emailHash
            return onError(res, 500, ERROR_VERIFYING);
        }

        const id = +req.query.id;
        const emailHash = req.query.code;
        const secrets = await getSecretsFromId(id);

        if (emailHash !== secrets?.emailHash) {
            return onError(res, 500, ERROR_VERIFYING);
        }

        const updated = await updateUser({ active: true });
        if (!updated) {
            return onError(res, 500, ERROR_VERIFYING);
        }

        return onSuccess(res, 200, "", null);
    } catch (error: any) {
        res.status(500).end(error.message);
    }
}
