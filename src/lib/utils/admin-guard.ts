import { UserRole } from "@prisma/client";
import { ForbiddenError, UserNotFoundError } from "./api-utils";
import type { CookieUser } from "./types";
import * as UserService from "@src/server/service/user-service";

export async function assertAdmin(user: CookieUser) {
    const dbUser = await UserService.getUserFromId(user.id);
    if (!dbUser) throw new UserNotFoundError();
    if (dbUser.role !== UserRole.ADMIN) throw new ForbiddenError();
}
