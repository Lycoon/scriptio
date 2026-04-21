import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";

import prisma from "@src/server/db";
import * as UserService from "@src/server/service/user-service";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/" },
    providers: [
        Google({
            allowDangerousEmailAccountLinking: true,
            // Our User model only stores email — drop name/picture before they reach the adapter.
            profile: (profile) => ({ id: profile.sub, email: profile.email }),
        }),
        Apple({
            allowDangerousEmailAccountLinking: true,
            profile: (profile) => ({ id: profile.sub, email: profile.email }),
        }),
    ],
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                // `createdAt` is set on programmatic sign-in (string) and missing for OAuth — fill it in
                const extUser = user as typeof user & { createdAt?: string };
                if (extUser.createdAt) {
                    token.createdAt = extUser.createdAt;
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
                    createdAt: token.createdAt ? new Date(token.createdAt as string) : new Date(),
                } as typeof session.user & { id: string; email: string; createdAt: Date };
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
