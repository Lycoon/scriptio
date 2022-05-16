import { NextApiRequest, NextApiResponse } from "next";
import { onError, onSuccess } from "../../../../src/lib/utils";
import { getProjects } from "../../../../src/server/service/project-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = +req.query["userId"];
  const user = req.session.user;

  if (!user || !user.isLoggedIn) {
    return onError(res, 403, "Forbidden");
  }

  const projects = await getProjects(userId);
  if (!projects) {
    return onError(res, 404, "User with id " + userId + " not found");
  }

  return onSuccess(res, 200, "", projects);
}
