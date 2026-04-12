import { NextRequest } from "next/server";
import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import {
    InternalServerError,
    Success,
    SuccessCreated,
    BodyFieldError,
    UserNotFoundError,
    validate,
} from "@src/lib/utils/api-utils";
import { requirePro } from "@src/lib/utils/pro-utils";

import { CreateProjectBodySchema } from "@src/lib/utils/api-bodies";
import { ApiContext, apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
export type { CreateProjectBody } from "@src/lib/utils/api-bodies";

/**
 * GET `/projects`
 *
 * Gets all projects from authenticated user
 */
async function getProjects(req: NextRequest, { user }: AuthApiContext) {
    const projects = await ProjectService.getMemberships(user.id);
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
async function createProject(req: NextRequest, { user }: AuthApiContext) {
    await requirePro(user.id);

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
        userId: user.id,
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
