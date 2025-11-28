import { NextApiRequest, NextApiResponse } from "next";

export default async function s3ObjectRoute(req: NextApiRequest, res: NextApiResponse) {
    const objectId = req.query["objectId"];
    res.redirect(process.env.S3_URL! + "/" + objectId);
}
