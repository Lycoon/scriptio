import { apiHandler } from "@src/lib/utils/api-handler";
import { validate } from "@src/lib/utils/api-utils";
import { NextApiRequest, NextApiResponse } from "next";

import z from "zod";

const QuerySchema = z.object({
    objectId: z.string(),
});

async function getFromS3(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);
    const { objectId } = query;
    res.redirect(process.env.S3_URL + "/" + objectId);
}

export default apiHandler(getFromS3);
