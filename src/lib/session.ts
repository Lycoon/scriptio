// this file is a wrapper with defaults to be used in both API routes and `getServerSideProps` functions
import { getIronSession, IronSession, type SessionOptions } from "iron-session";
import { CookieUser } from "@src/lib/utils/types";
import { NextApiRequest, NextApiResponse } from "next";

const sessionOptions: SessionOptions = {
    password: process.env.SECRET_COOKIE as string,
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
export const getSession = async (req: NextApiRequest, res: NextApiResponse): Promise<IronSession<CookieUser>> => {
    return getIronSession<CookieUser>(req, res, sessionOptions);
};

/*
 * Used to get the user from the session (in /api/users/cookie)
 */
export const getCookieUser = async (req: NextApiRequest, res: NextApiResponse): Promise<CookieUser | undefined> => {
    const session = await getSession(req, res);
    return extractUserFromSession(session);
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
