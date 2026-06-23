import { CookieUser } from "@src/lib/utils/types";
import { headers } from "next/headers";
import { decode } from "next-auth/jwt";
import { UserRole } from "../generated/client/client";
import { auth } from "@src/auth";
import { DESKTOP_BEARER_SALT } from "@src/lib/auth-tokens";

/**
 * Resolve the current user from either:
 * 1. A NextAuth-encoded JWT in the `Authorization: Bearer <token>` header (desktop clients)
 * 2. The NextAuth web session cookie (handled by `auth()`)
 *
 * Both paths verify against the same `AUTH_SECRET`. The desktop bearer JWE is
 * encoded by api/desktop/token and api/auth/magic-link/verify with
 * `DESKTOP_BEARER_SALT` — see lib/auth-cookies.ts for why the salts differ
 * between the cookie path and the bearer path.
 */
export const getCookieUser = async (): Promise<CookieUser | undefined> => {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        try {
            const decoded = await decode({
                token,
                secret: process.env.AUTH_SECRET!,
                salt: DESKTOP_BEARER_SALT,
            });
            if (decoded?.id) {
                return {
                    id: decoded.id as string,
                    email: decoded.email as string,
                    createdAt: new Date(decoded.createdAt as string),
                    role: (decoded.role as UserRole) ?? UserRole.USER,
                };
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    const session = await auth();
    if (!session?.user) return undefined;
    return session.user as unknown as CookieUser;
};
