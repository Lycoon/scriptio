import { NextApiRequest, NextApiResponse } from "next";
import { getProjects } from "../../../../src/server/service/project-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = +req.query["userId"];

  const projects = await getProjects(userId);
  if (projects === null) {
    res.status(404).json({ error: "User with id " + userId + " not found" });
    return;
  }

  res.status(200).json(projects!);
}
