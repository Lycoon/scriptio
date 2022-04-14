import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import auth from "../../../src/middleware/auth";
import { createUser } from "../../../src/server/service/user-service";

const handler = nextConnect();

handler.use(auth).post(async (req: NextApiRequest, res: NextApiResponse) => {
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
    res.status(500).json({ error: "User already registered with that email" });
    return;
  }

  res.status(201).json({ status: "SUCCESS" });
});

export default handler;
