import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import {
  getUserFromEmail,
  getUserSecrets,
} from "../server/service/user-service";
import { validatePassword } from "./auth";

passport.serializeUser(function (user: any, done) {
  // serialize the email into session
  done(null, user.email);
});

passport.deserializeUser(function (req: any, email: any, done: any) {
  // deserialize the email back into user object
  const user = getUserFromEmail(email);
  done(null, user);
});

passport.use(
  new LocalStrategy(
    { passReqToCallback: true },
    async (req, email: any, password: any, done) => {
      const user = await getUserSecrets(email);
      if (!user || !validatePassword(password, user.password, user.salt)) {
        done(null, null);
      } else {
        done(null, user);
      }
    }
  )
);

export default passport;
