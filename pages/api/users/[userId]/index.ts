import type { NextApiRequest, NextApiResponse } from "next";
import { onError, onSuccess } from "../../../../src/lib/utils";
import { getUserFromId } from "../../../../src/server/service/user-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = +req.query["userId"];
  const user = req.session.user;

  if (!user || !user.isLoggedIn) {
    return onError(res, 403, "Forbidden");
  }

  const fetchedUser = await getUserFromId(userId);

  if (!fetchedUser) {
    return onError(res, 404, "User with id " + userId + " not found");
  }

  return onSuccess(res, 200, "", fetchedUser);
}
