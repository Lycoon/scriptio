import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";

import prisma from "@src/server/db";
import * as UserService from "@src/server/service/user-service";
import * as SecretService from "@src/lib/utils/secrets";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/" },
    providers: [
        Google({ allowDangerousEmailAccountLinking: true }),
        Apple({ allowDangerousEmailAccountLinking: true }),
        Credentials({
            credentials: {
                email: {},
                password: {},
            },
            authorize: async (credentials) => {
                const email = credentials?.email as string | undefined;
                const password = credentials?.password as string | undefined;
                if (!email || !password) return null;

                const user = await UserService.getUserFromEmail(email, true);
                if (!user || !user.secrets) return null;
                if (!user.emailVerified) {
                    throw new Error("EmailNotVerified");
                }

                const ok = await SecretService.checkPassword(user.secrets.password, password);
                if (!ok) return null;

                return {
                    id: user.id,
                    email: user.email,
                    createdAt: user.createdAt.toISOString(),
                };
            },
        }),
    ],
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                // `createdAt` is set on credentials sign-in (string) and missing for OAuth — fill it in
                if ((user as any).createdAt) {
                    token.createdAt = (user as any).createdAt;
                } else if (token.id && !token.createdAt) {
                    const dbUser = await UserService.getUserFromId(token.id as string);
                    if (dbUser) token.createdAt = dbUser.createdAt.toISOString();
                }
            }
            return token;
        },
        session: async ({ session, token }) => {
            if (token.id) {
                session.user = {
                    ...session.user,
                    id: token.id as string,
                    email: token.email as string,
                    createdAt: token.createdAt
                        ? new Date(token.createdAt as string)
                        : session.user?.createdAt,
                } as any;
            }
            return session;
        },
    },
    events: {
        // OAuth provider sign-ups arrive here once the adapter has created the row;
        // Google and Apple verify emails out-of-band, so we mark the user verified.
        createUser: async ({ user }) => {
            if (user.id) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { emailVerified: new Date() },
                });
            }
        },
    },
});
