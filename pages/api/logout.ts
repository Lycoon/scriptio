import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import type { User } from "../../pages/api/users/index";

export default withIronSessionApiRoute(logoutRoute, sessionOptions);

function logoutRoute(req: NextApiRequest, res: NextApiResponse<User>) {
  req.session.destroy();
  res.json({ isLoggedIn: false, email: "", id: -1, createdAt: new Date() });
}
