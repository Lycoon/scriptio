import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { ForbiddenError, Success, validate } from "@src/lib/utils/api-utils";

import * as ProjectService from "@src/server/service/project-service";

import { SignJWT } from "jose";
import z from "zod";
import { NextRequest } from "next/server";

const QuerySchema = z.object({
    projectId: z.string(),
});

async function projectCloudTokenRoute(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ForbiddenError();
    }

    const payload = {
        userId: user.id,
        projectId: projectId,
        role: member.role,
    };

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(secret);

    return Success(token);
}

export const GET = apiHandler(projectCloudTokenRoute);
