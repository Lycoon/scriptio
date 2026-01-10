import { getIronSession, IronSession, type SessionOptions } from "iron-session";
import { CookieUser } from "@src/lib/utils/types";
import { cookies } from "next/headers";

export interface SessionData {
    user?: CookieUser;
}

export const sessionOptions: SessionOptions = {
    password: process.env.COOKIE_SECRET as string,
    cookieName: "auth-cookie",
    cookieOptions: {
        secure: process.env.NODE_ENV === "production",
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
 * Used to get the user from the session (in /api/users/cookie)
 */
export const getCookieUser = async (): Promise<CookieUser | undefined> => {
    const session = await getSession();
    return session.user;
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
