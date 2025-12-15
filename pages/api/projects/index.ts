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

export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;
const CreateProjectBodySchema = z.object({
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
            const body = validate(CreateProjectBodySchema, req.body);
            return createProject(user.id, body, res);
    }
}

/**
 * GET `/projects`
 *
 * Gets all projects from authenticated user
 */
async function getProjects(userId: number, res: NextApiResponse) {
    const projects = await ProjectService.getMemberships(userId);
    if (!projects) {
        throw new UserNotFoundError();
    }

    return Success(res, projects);
}

/**
 * POST `/projects`
 *
 * Creates a new project
 */
async function createProject(userId: number, body: CreateProjectBody, res: NextApiResponse) {
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
        hasPoster: poster !== undefined,
    });

    if (!newProject) {
        throw new InternalServerError();
    }
    if (poster) {
        await S3.upload(`poster-${newProject.id}`, poster);
    }

    return SuccessCreated(res, newProject);
}

export default apiHandler(projectsRoute);
