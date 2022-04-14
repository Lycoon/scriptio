import nextConnect from "next-connect";
import passport from "../auth/passport";
import session from "../auth/session";

const auth = nextConnect()
  .use(
    session({
      name: "sess",
      secret: process.env.TOKEN_SECRET,
      cookie: {
        maxAge: 60 * 60 * 8, // 8 hours,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
      },
    })
  )
  .use((req: any, res: any, next) => {
    // Initialize mocked database
    // Remove this after you add your own database
    req.session.users = req.session.users || [];
    next();
  })
  .use(passport.initialize())
  .use(passport.session());

export default auth;
