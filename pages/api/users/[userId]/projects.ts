import { withIronSessionApiRoute } from "iron-session/next";
import { NextApiRequest, NextApiResponse } from "next";
import { MISSING_BODY } from "../../../../src/lib/messages";
import { sessionOptions } from "../../../../src/lib/session";
import { onError, onSuccess } from "../../../../src/lib/utils";
import {
  createProject,
  getProjects,
} from "../../../../src/server/service/project-service";

export default withIronSessionApiRoute(handler, sessionOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = +req.query["userId"];
  const user = req.session.user;

  if (!user || !user.isLoggedIn || userId !== user.id) {
    return onError(res, 403, "Forbidden");
  }

  switch (req.method) {
    case "GET":
      return getMethod(userId, res);
    case "POST":
      return postMethod(userId, req.body, res);
  }
}

async function getMethod(userId: number, res: NextApiResponse) {
  const projects = await getProjects(userId);
  if (!projects) {
    return onError(res, 404, "User with id " + userId + " not found");
  }

  return onSuccess(res, 200, "", projects);
}

async function postMethod(userId: number, body: any, res: NextApiResponse) {
  if (!body || !body.title) {
    return onError(res, 400, MISSING_BODY);
  }

  const created = await createProject({
    title: body.title,
    description: body.description,
    userId,
  });

  if (!created) {
    return onError(res, 500, "Project creation failed");
  }

  return onSuccess(res, 201, "", created);
}
