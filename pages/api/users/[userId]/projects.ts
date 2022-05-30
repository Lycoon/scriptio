import { withIronSessionApiRoute } from "iron-session/next";
import { NextApiRequest, NextApiResponse } from "next";
import { MISSING_BODY } from "../../../../src/lib/messages";
import { sessionOptions } from "../../../../src/lib/session";
import { onError, onSuccess } from "../../../../src/lib/utils";
import {
  createProject,
  getProjectFromId,
  getProjects,
  updateProject,
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
    case "PATCH":
      return patchMethod(userId, req.body, res);
  }
}

async function patchMethod(userId: number, body: any, res: NextApiResponse) {
  const projectId = +body["projectId"];
  const screenplay = body["screenplay"];
  const title: string = body["title"];
  const description = body["description"];

  if (!projectId) {
    return onError(res, 400, MISSING_BODY);
  }

  const project = await getProjectFromId(projectId);
  if (project?.userId !== userId) {
    // not user's project
    return onError(res, 403, "Forbidden");
  }

  if (title && title.length < 2) {
    return onError(res, 400, "Title must be at least 2-character long");
  }

  const updated = await updateProject({
    projectId,
    screenplay,
    title,
    description,
  });

  if (!updated) {
    return onError(res, 500, "Project update failed");
  }

  return onSuccess(res, 200, "", updated);
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
