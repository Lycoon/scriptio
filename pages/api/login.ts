import type { User } from "../api/users/index";

import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../src/lib/session";
import { NextApiRequest, NextApiResponse } from "next";
import {
  checkPassword,
  getUserFromEmail,
} from "../../src/server/service/user-service";

export default withIronSessionApiRoute(loginRoute, sessionOptions);

async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
  const { email, password } = await req.body;

  if (!email || !password || !checkPassword(email, password)) {
    res.status(401).json({ error: "Wrong credentials" });
    return;
  }

  // Filling session with data
  try {
    const data = await getUserFromEmail(email);
    const user = {
      isLoggedIn: true,
      email,
      id: data?.id,
      createdAt: data?.createdAt,
    } as User;

    req.session.user = user;
    await req.session.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
}
