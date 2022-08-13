import { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../../src/lib/session";
import { Prisma, Settings } from "@prisma/client";
import { Secrets } from "../../../src/server/repository/user-repository";

export type CookieUser = {
    id: number;
    email: string;
    isLoggedIn: boolean;
};

export type User = {
    id: number;
    email: string;
    verified: boolean;
    createdAt: Date;
    settings: Settings;
    secrets?: Secrets;
};

export type Project = {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    poster: string;
    description: string | null;
    screenplay: Prisma.JsonValue | null;
    userId: number;
};

export default withIronSessionApiRoute(userRoute, sessionOptions);

async function userRoute(
    req: NextApiRequest,
    res: NextApiResponse<Partial<CookieUser> | null>
) {
    if (req.session.user) {
        // in a real world application you might read the user id from the session and then do a database request
        // to get more information on the user if needed
        res.json({
            ...req.session.user,
            isLoggedIn: true,
        });
    } else {
        res.json({
            isLoggedIn: false,
        });
    }
}
