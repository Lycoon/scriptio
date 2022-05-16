import type { User } from "../api/users/index";

import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import {
  checkPassword,
  getUserFromEmail,
} from "../../src/server/service/user-service";
import { onError, onSuccess } from "../../src/lib/utils";
import { WRONG_CREDENTIALS } from "../../src/lib/messages";

export default withIronSessionApiRoute(loginRoute, sessionOptions);

async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
  const { email, password } = await req.body;

  const matchingPassword = await checkPassword(email, password);
  if (!email || !password || !matchingPassword) {
    return onError(res, 401, WRONG_CREDENTIALS);
  }

  // Filling session with data
  try {
    const data = await getUserFromEmail(email);
    const user = {
      isLoggedIn: true,
      id: data?.id,
      email: data?.email,
    } as User;

    req.session.user = user;
    await req.session.save();

    return onSuccess(res, 200, "", user);
  } catch (error) {
    return onError(res, 500, (error as Error).message);
  }
}
