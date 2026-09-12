import { NextRequest } from "next/server";

import * as UserService from "@src/server/service/user-service";
import * as ProjectService from "@src/server/service/project-service";
import { Success } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

async function getStats(req: NextRequest, { user }: AuthApiContext) {
    await assertAdmin(user);

    const [userCount, activeProCount, projectCount] = await Promise.all([
        UserService.countUsers(),
        UserService.countActiveProUsers(),
        ProjectService.countProjects(),
    ]);

    return Success({
        userCount,
        activeProCount,
        projectCount,
    });
}

export const GET = apiHandler(getStats);
