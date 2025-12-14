import { apiHandler } from "@src/lib/utils/api-handler";
import { NextApiRequest, NextApiResponse } from "next";

async function s3ObjectRoute(req: NextApiRequest, res: NextApiResponse) {
    const objectId = req.query["objectId"];
    res.redirect(process.env.S3_URL! + "/" + objectId);
}

export default apiHandler(s3ObjectRoute);
