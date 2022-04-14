import type { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import auth from "../../../../src/middleware/auth";
import { getUserFromId } from "../../../../src/server/service/user-service";

const handler = nextConnect();

handler.use(auth).get(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = +req.query["userId"];

  const user = await getUserFromId(userId);
  if (user === null) {
    res.status(404).json({ error: "User with id " + userId + " not found" });
    return;
  }

  res.status(200).json(user!);
});

export default handler;
