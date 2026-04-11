import { NextRequest } from "next/server";
import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";
import { validate } from "@src/lib/utils/api-utils";

import z from "zod";
import { redirect } from "next/navigation";

const QuerySchema = z.object({
    objectId: z.string(),
});

async function getFromS3(req: NextRequest, { routeParams }: ApiContext) {
    const { objectId } = validate(QuerySchema, routeParams);
    redirect(process.env.S3_URL + "/" + objectId);
}

export const GET = apiHandler(getFromS3);
