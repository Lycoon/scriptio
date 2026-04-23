import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole } from "./generated/client/client";

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
                // `createdAt` may be available on programmatic sign-in but not OAuth.
                const extUser = user as typeof user & { createdAt?: string };
                if (extUser.createdAt) {
                    token.createdAt = extUser.createdAt;
                }
            }
            // Always sync from DB so role changes (e.g. granting admin) are reflected
            // without requiring a sign-out. Called on every auth() invocation.
            if (token.id) {
                const dbUser = await UserService.getUserFromId(token.id as string);
                if (dbUser) {
                    if (!token.createdAt) token.createdAt = dbUser.createdAt.toISOString();
                    token.role = dbUser.role;
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
                    role: (token.role as UserRole) ?? UserRole.USER,
                } as typeof session.user & {
                    id: string;
                    email: string;
                    createdAt: Date;
                    role: UserRole;
                };
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
