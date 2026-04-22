import { NextRequest } from "next/server";
import z from "zod";

import * as ProjectService from "@src/server/service/project-service";
import { Success, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const QuerySchema = z.object({
    q: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.coerce.number().int().min(0).optional(),
});

async function searchProjects(req: NextRequest, { searchParams, user }: AuthApiContext) {
    await assertAdmin(user);

    const { q, limit = 25, cursor } = validate(QuerySchema, searchParams);
    const term = (q ?? "").trim();

    if (!term) {
        return Success({ projects: [], nextCursor: null });
    }

    const projects = await ProjectService.searchProjects(term, limit + 1, cursor);
    const hasMore = projects.length > limit;
    const page = hasMore ? projects.slice(0, limit) : projects;
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null;

    return Success({ projects: page, nextCursor });
}

export const GET = apiHandler(searchProjects);
