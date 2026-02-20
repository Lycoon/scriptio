import { NextRequest } from "next/server";
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

import { CreateProjectBodySchema } from "@src/lib/utils/api-bodies";
export type { CreateProjectBody } from "@src/lib/utils/api-bodies";

/**
 * GET `/projects`
 *
 * Gets all projects from authenticated user
 */
async function getProjects(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const projects = await ProjectService.getMemberships(cookie.id);
    if (!projects) {
        throw new UserNotFoundError();
    }

    return Success(projects);
}

/**
 * POST `/projects`
 *
 * Creates a new project
 */
async function createProject(req: NextRequest) {
    const cookie = await getCookieUser();
    if (!cookie || !cookie.id) {
        throw new UnauthorizedError();
    }

    const body = await req.json();
    const { title, description, author, poster } = validate(CreateProjectBodySchema, body);

    if (title.length < 1 || title.length > 256) {
        throw new BodyFieldError("Title must be between 1 and 256 characters");
    }
    if (description && description.length > 2048) {
        throw new BodyFieldError("Description must be at most 2048-character long");
    }
    if (author && author.length > 256) {
        throw new BodyFieldError("Author must be at most 256-character long");
    }

    const newProject = await ProjectService.create({
        title,
        description,
        author,
        userId: cookie.id,
        hasPoster: poster !== undefined,
    });

    if (!newProject) {
        throw new InternalServerError();
    }
    if (poster) {
        await S3.upload(`poster-${newProject.id}`, poster);
    }

    return SuccessCreated(newProject);
}

export const GET = apiHandler(getProjects);
export const POST = apiHandler(createProject);
