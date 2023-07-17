// this file is a wrapper with defaults to be used in both API routes and `getServerSideProps` functions
import type { IronSessionOptions } from "iron-session";
import { CookieUser } from "@src/lib/utils/types";

export const sessionOptions: IronSessionOptions = {
    password: process.env.SECRET_COOKIE as string,
    cookieName: "auth-cookie",
    cookieOptions: {
        secure: process.env.NODE_ENV === "production",
    },
};

// This is where we specify the typings of req.session.*
declare module "iron-session" {
    interface IronSessionData {
        user: CookieUser | null;
    }
}
