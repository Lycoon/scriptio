import passport from "passport";
import nextConnect from "next-connect";
import { localStrategy } from "../../src/lib/password-local";
import { setLoginSession } from "../../src/lib/auth";
import next from "next";

passport.use(localStrategy);

export default nextConnect()
  .use(passport.initialize())
  .post(async (req: any, res: any) => {
    try {
      console.log("body: ", req.body);
      // session is the payload to save in the token, it may contain basic info about the user
      passport.authenticate("local");

      // SHOULD TAKE USER
      const session = { email: req.body.email };

      await setLoginSession(res, session);
      res.status(200).send({ done: true });
    } catch (error) {
      res.status(401).send({ error: "ERROR" });
    }
  });
