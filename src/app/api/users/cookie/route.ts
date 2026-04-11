import { getCookieUser } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";

async function cookieRoute(req: Request) {
    const user = await getCookieUser();
    return Success(user ?? null);
}

export const GET = apiHandler(cookieRoute);
