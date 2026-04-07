import { ApiContext, apiHandler } from "@src/lib/utils/api-handler";

import { validate } from "@src/lib/utils/api-utils";

import * as UserService from "@src/server/service/user-service";
import * as SecretService from "@src/lib/utils/secrets";
import prisma from "@src/server/db";
import z from "zod";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

const VERIFY_PREFIX = "verify:";

const QuerySchema = z.object({
    token: z.string(),
});

/**
 * GET `/verify`
 *
 * Validates a single-use VerificationToken (`identifier = "verify:<email>"`),
 * marks the matching user as verified, then deletes the token.
 */
async function verifyUser(req: NextRequest, { searchParams }: ApiContext) {
    let target = "/?verifyStatus=failed";

    try {
        const { token } = validate(QuerySchema, searchParams);
        const hashed = SecretService.hashToken(token);

        const record = await prisma.verificationToken.findUnique({
            where: { token: hashed },
        });

        if (!record || !record.identifier.startsWith(VERIFY_PREFIX) || record.expires < new Date()) {
            // target stays "/?verifyStatus=failed"
        } else {
            const email = record.identifier.slice(VERIFY_PREFIX.length);
            const user = await UserService.getUserFromEmail(email);

            if (user && user.emailVerified) {
                target = "/?verifyStatus=used";
            } else if (user) {
                await UserService.setVerified(user.id);
                target = "/?verified=1";
            }

            await prisma.verificationToken.delete({ where: { token: hashed } });
        }
    } catch {
        target = "/?verifyStatus=failed";
    }

    redirect(target);
}

export const GET = apiHandler(verifyUser);
