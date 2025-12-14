import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import { apiHandler } from "@src/lib/utils/api-handler";
import {
    InternalServerError,
    Success,
    SuccessCreated,
    UnauthorizedError,
    BodyFieldError,
    UserNotFoundError,
    validate,
} from "@src/lib/utils/api-utils";

import z from "zod";

type Body = z.infer<typeof BodySchema>;
const BodySchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    poster: z.string().optional(),
});

async function projectsRoute(req: NextApiRequest, res: NextApiResponse) {
    const user = await getCookieUser(req, res);

    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getProjects(user.id, res);
        case "POST":
            const body = validate(BodySchema, req.body);
            return createProject(user.id, body, res);
    }
}

/**
 * GET `/projects`
 *
 * Gets all projects from authenticated user
 */
async function getProjects(userId: number, res: NextApiResponse) {
    const query = await ProjectService.getAll(userId);
    if (!query) {
        throw new UserNotFoundError();
    }

    return Success(res, query.projects);
}

/**
 * POST `/projects`
 *
 * Creates a new project
 */
async function createProject(userId: number, body: Body, res: NextApiResponse) {
    const { title, description, poster } = body;

    if (title.length < 1 || title.length > 256) {
        throw new BodyFieldError("Title must be between 1 and 256 characters");
    }
    if (description && description.length > 2048) {
        throw new BodyFieldError("Description must be at most 2048-character long");
    }

    const newProject = await ProjectService.create({
        title,
        description,
        userId,
        poster,
    });

    if (!newProject) {
        throw new InternalServerError();
    }
    if (poster) {
        await S3.upload(newProject.id, poster);
    }

    return SuccessCreated(res, newProject);
}

export default apiHandler(projectsRoute);
