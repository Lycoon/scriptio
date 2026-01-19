import { NextRequest } from "next/server";
import { getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { SuccessNoContent } from "@src/lib/utils/api-utils";

async function logoutRoute(req: NextRequest) {
    const session = await getSession();
    session.destroy();
    return SuccessNoContent();
}

export const POST = apiHandler(logoutRoute);
