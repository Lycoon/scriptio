import type { NextApiRequest, NextApiResponse } from "next";
import { getUserFromId } from "../../../../src/server/service/user-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = +req.query["userId"];
  const user = await getUserFromId(userId);

  if (user === null) {
    res.status(404).json({ error: "User with id " + userId + " not found" });
    return;
  }

  res.status(200).json(user!);
}
