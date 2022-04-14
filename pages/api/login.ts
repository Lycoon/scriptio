import nextConnect from "next-connect";
import auth from "../../src/middleware/auth";
import passport from "../../src/auth/passport";
import { NextApiRequest, NextApiResponse } from "next";

const handler = nextConnect();

handler
  .use(auth)
  .post(
    passport.authenticate("local"),
    (req: NextApiRequest, res: NextApiResponse) => {
      res.json({ user: req.body.email });
    }
  );

export default handler;
