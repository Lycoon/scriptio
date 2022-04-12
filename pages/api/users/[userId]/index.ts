import type { NextApiRequest, NextApiResponse } from "next";
import { getUserFromId } from "../../../../src/server/service/user-service";

type User = {
  email: string;
  createdAt: Date;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<User | any>
) {
  const method = req.method!;
  const userId = +req.query["userId"];

  if (method !== "GET") {
    res.status(405).json({});
  }

  const user = await getUserFromId(userId);
  if (user === null) {
    res.status(404).json({});
    return;
  }

  res.status(200).json(user!);
}
