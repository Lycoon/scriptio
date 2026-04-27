/**
 * NextAuth (Auth.js v5) configuration.
 *
 * This file is the spine of four cooperating auth flows:
 *   1. Browser magic link  — verify route mints a JWE and sets the session cookie.
 *   2. Browser OAuth       — Google/Apple, handled end-to-end by NextAuth.
 *   3. Desktop magic link  — verify route puts a JWE on the bridge for Tauri.
 *   4. Desktop OAuth       — browser OAuth here, then /api/desktop/token mints
 *                            a fresh JWE for Tauri to pick up via the bridge.
 *
 * The desktop bearer JWEs all use `DESKTOP_BEARER_SALT` (lib/auth-cookies.ts)
 * so lib/session.ts can decrypt them in middleware. The web cookie uses Auth.js's
 * default salt (= cookie name) and is never encoded by us directly except in the
 * magic-link verify route, which uses `getWebSessionCookie()` to stay aligned.
 */

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
            // Explicitly request email on first consent. Apple only returns it once —
            // subsequent sign-ins omit it, so the adapter links via providerAccountId
            // and we re-sync email from the DB in the jwt callback instead.
            authorization: { params: { scope: "name email" } },
            profile: (profile) => {
                if (!profile.email) {
                    // This only runs on first sign-in. If Apple didn't return an email
                    // (e.g. user denied the scope), fail early rather than creating a
                    // User row with a missing email field.
                    throw new Error("Apple did not return an email address. Ensure the email scope is granted.");
                }
                return { id: profile.sub, email: profile.email };
            },
        }),
    ],
    callbacks: {
        // Apple uses response_mode=form_post; the cross-site POST back from
        // appleid.apple.com drops the `callbackUrl` cookie (Auth.js promotes state/nonce
        // to SameSite=None for form_post but not callbackUrl), so NextAuth falls back to
        // the homepage — passed to this callback as either the absolute baseUrl or the
        // relative "/". Send those cases to /desktop-oauth/complete, which recovers the
        // nonce from sessionStorage (set by DesktopOAuthStart before the OAuth handoff)
        // and finishes the desktop bridge. Web users who signed in with Apple and have
        // no nonce are redirected to /projects from within that page.
        redirect: async ({ url, baseUrl }) => {
            const isHomepage =
                url === baseUrl || url === `${baseUrl}/` || url === "/" || url === "";
            if (isHomepage) return `${baseUrl}/desktop-oauth/complete`;
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            try {
                if (new URL(url).origin === baseUrl) return url;
            } catch {}
            return `${baseUrl}/projects`;
        },
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
            // Email is also re-synced — Apple omits it on subsequent sign-ins, so the
            // initial `user.email` may be undefined on a re-sign-in if PrismaAdapter
            // routed through profile() rather than the existing User row.
            if (token.id) {
                const dbUser = await UserService.getUserFromId(token.id as string);
                if (dbUser) {
                    if (!token.createdAt) token.createdAt = dbUser.createdAt.toISOString();
                    token.role = dbUser.role;
                    token.email = dbUser.email;
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
