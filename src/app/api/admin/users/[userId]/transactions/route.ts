import { NextRequest } from "next/server";
import z from "zod";

import * as TransactionService from "@src/server/service/transaction-service";
import { Success, validate } from "@src/lib/utils/api-utils";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { assertAdmin } from "@src/lib/utils/admin-guard";

const ParamsSchema = z.object({ userId: z.string().min(1) });

async function getUserTransactions(req: NextRequest, { routeParams, user }: AuthApiContext) {
    await assertAdmin(user);
    const { userId } = validate(ParamsSchema, routeParams);

    const transactions = await TransactionService.getTransactionsByUser(userId);
    return Success(transactions);
}

export const GET = apiHandler(getUserTransactions);
