import { getIronSession, IronSession, type SessionOptions } from "iron-session";
import { CookieUser } from "@src/lib/utils/types";
import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";

export interface SessionData {
    user?: CookieUser;
}

export interface DesktopTokenPayload {
    id: string;
    email: string;
    createdAt: string; // ISO string in JWT
}

export const sessionOptions: SessionOptions = {
    password: process.env.COOKIE_SECRET,
    cookieName: "auth-cookie",
    cookieOptions: {
        secure: process.env.NODE_ENV !== "development",
    },
};

/*
 * getSession is a wrapper around getIronSession with the correct types
 *
 * It should only be used to operate a destroy or a save on the session (during login or logout)
 * Prefer using getCookieUser to get the user from the session
 */
export const getSession = async (): Promise<IronSession<SessionData>> => {
    return getIronSession<SessionData>(await cookies(), sessionOptions);
};

/*
 * Check if the request is from a desktop client via Authorization header
 */
const getDesktopUser = async (): Promise<CookieUser | undefined> => {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return undefined;
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string) as DesktopTokenPayload;
        return {
            id: payload.id,
            email: payload.email,
            createdAt: new Date(payload.createdAt),
        };
    } catch {
        return undefined;
    }
};

/*
 * Used to get the user from either:
 * 1. Desktop: JWT in Authorization header (Bearer token)
 * 2. Web: Session cookie
 */
export const getCookieUser = async (): Promise<CookieUser | undefined> => {
    // First, check for desktop JWT auth
    const desktopUser = await getDesktopUser();
    if (desktopUser) {
        return desktopUser;
    }

    // Fall back to cookie-based session for web
    const session = await getSession();
    return session.user;
};

/*
 * Check if the current request is from a desktop client
 */
export const isDesktopRequest = async (): Promise<boolean> => {
    const headersList = await headers();
    return headersList.get("x-client-type") === "desktop";
};

/*
 * Generate a long-lived JWT for desktop authentication
 */
export const generateDesktopToken = (user: CookieUser): string => {
    const payload: DesktopTokenPayload = {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
    };

    return jwt.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: "30d", // Desktop tokens last 30 days
    });
};

export const authenticate = async ({ id, email, createdAt }: CookieUser) => {
    const session = await getSession();
    const cookie: CookieUser = { id, email, createdAt };
    session.user = cookie;
    await session.save();
    return cookie;
};

/*
 * Used to extract the user from the session, returning undefined if the session is empty
 */
export const extractUserFromSession = (session: IronSession<CookieUser>): CookieUser | undefined => {
    if (Object.keys(session).length === 0) return undefined;
    else
        return {
            id: session.id,
            email: session.email,
            createdAt: session.createdAt,
        };
};
