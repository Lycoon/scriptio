import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { authenticate, generateDesktopToken, isDesktopRequest } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";

import { NextRequest } from "next/server";
import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import { Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import { LoginBodySchema } from "@src/lib/utils/api-bodies";
export type { LoginBody } from "@src/lib/utils/api-bodies";

/**
 * POST `/login`
 *
 * Authenticates a user into the application.
 * - Web clients: Issues an HTTP-only session cookie
 * - Desktop clients: Returns a JWT token (detected via x-client-type: desktop header)
 */
async function loginRoute(req: NextRequest) {
    const body = await req.json();
    const { email, password } = validate(LoginBodySchema, body);

    const user = await UserService.getUserFromEmail(email, true);
    if (!user || !user.secrets) {
        throw new UnauthorizedError(WRONG_CREDENTIALS);
    }

    if (!user.verified) {
        throw new UnauthorizedError(NOT_VERIFIED);
    }

    const matchingPassword = await SecretService.checkPassword(user.secrets.password, password);
    if (!matchingPassword) {
        throw new UnauthorizedError(WRONG_CREDENTIALS);
    }

    // Check if this is a desktop client request
    const isDesktop = await isDesktopRequest();

    if (isDesktop) {
        // Desktop: Return JWT token for local storage
        const token = generateDesktopToken(user);
        return Success({
            user: { id: user.id, email: user.email, createdAt: user.createdAt },
            token,
        });
    }

    // Web: Issue session cookie
    const cookie = await authenticate(user);
    return Success(cookie);
}

export const POST = apiHandler(loginRoute);
