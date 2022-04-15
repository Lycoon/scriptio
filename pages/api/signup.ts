import { NextApiRequest, NextApiResponse } from "next";
import { createUser } from "../../src/server/service/user-service";

export default async function signup(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const email: string = req.body.email;
    const password: string = req.body.password;

    if (!email || !password) {
      res.status(400).json({ error: "Missing body or body fields" });
      return;
    }

    if (password.length < 8) {
      res
        .status(400)
        .json({ error: "Password needs to be at least 8 characters long" });
      return;
    }

    const created = await createUser(email, password);
    if (created === null) {
      res
        .status(500)
        .send({ error: "A user is already registered with that email" });
      return;
    }

    res.status(200).send({ done: true });
  } catch (error: any) {
    res.status(500).end(error.message);
  }
}
