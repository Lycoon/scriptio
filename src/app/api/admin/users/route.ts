import { NextRequest } from "next/server";
import z from "zod";

import * as UserService from "@src/server/service/user-service";
import { Success, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const QuerySchema = z.object({
    q: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.coerce.number().int().min(0).optional(),
});

async function searchUsers(req: NextRequest, { searchParams, user }: AuthApiContext) {
    await assertAdmin(user);

    const { q, limit = 25, cursor } = validate(QuerySchema, searchParams);
    const term = (q ?? "").trim();

    const users = await UserService.searchUsers(term, limit + 1, cursor);
    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null;

    return Success({ users: page, nextCursor });
}

export const GET = apiHandler(searchUsers);
