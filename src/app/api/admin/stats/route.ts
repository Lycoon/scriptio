import { NextRequest } from "next/server";

import * as UserService from "@src/server/service/user-service";
import * as ProjectService from "@src/server/service/project-service";
import * as TransactionService from "@src/server/service/transaction-service";
import { Success } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

async function getStats(req: NextRequest, { user }: AuthApiContext) {
    await assertAdmin(user);

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [userCount, activeProCount, projectCount, transactionsThisMonth] = await Promise.all([
        UserService.countUsers(),
        UserService.countActiveProUsers(),
        ProjectService.countProjects(),
        TransactionService.countTransactionsSince(startOfMonth),
    ]);

    return Success({
        userCount,
        activeProCount,
        projectCount,
        transactionsThisMonth,
    });
}

export const GET = apiHandler(getStats);
