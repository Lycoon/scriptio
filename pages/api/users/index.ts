import { NextApiRequest, NextApiResponse } from "next";
import { getLoginSession } from "../../../src/lib/auth";
import { getUserFromEmail } from "../../../src/server/service/user-service";

export default async function user(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getLoginSession(req);
    console.log("session: ", session);

    const fetched = await getUserFromEmail(session);

    const user = (session && fetched) ?? null;

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).end("Authentication token is invalid, please log in");
  }
}
