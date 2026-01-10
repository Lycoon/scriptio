import { NOT_VERIFIED, WRONG_CREDENTIALS } from "@src/lib/messages";
import { authenticate, getSession } from "@src/lib/session";
import { apiHandler } from "@src/lib/utils/api-handler";

import { NextRequest } from "next/server";
import * as SecretService from "@src/lib/utils/secrets";
import * as UserService from "@src/server/service/user-service";
import { Success, UnauthorizedError, validate } from "@src/lib/utils/api-utils";

import z from "zod";
import { id } from "@node_modules/zod/v4/locales/index.cjs";

export type LoginBody = z.infer<typeof LoginBodySchema>;
const LoginBodySchema = z.object({
    email: z.email(),
    password: z.string(),
});

/**
 * POST `/login`
 *
 * Authenticates a user into the application, issuing a cookie
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

    const cookie = await authenticate(user);
    return Success(cookie);
}

export const POST = apiHandler(loginRoute);
