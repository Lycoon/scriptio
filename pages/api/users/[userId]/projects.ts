import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import auth from "../../../../src/middleware/auth";
import { getProjects } from "../../../../src/server/service/project-service";

const handler = nextConnect();

handler.use(auth).get(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = +req.query["userId"];

  const projects = await getProjects(userId);
  if (projects === null) {
    res.status(404).json({ error: "User with id " + userId + " not found" });
    return;
  }

  res.status(200).json(projects!);
});
