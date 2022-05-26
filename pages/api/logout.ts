import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import type { User } from "../../pages/api/users/index";
import { onSuccess } from "../../src/lib/utils";

export default withIronSessionApiRoute(logoutRoute, sessionOptions);

function logoutRoute(req: NextApiRequest, res: NextApiResponse<User>) {
  req.session.destroy();

  onSuccess(res, 200, "", { isLoggedIn: false });
}
