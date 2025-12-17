import { NextApiRequest, NextApiResponse } from "next";
import { getCookieUser } from "@src/lib/session";
import { ProjectRole } from "@prisma/client";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { apiHandler } from "@src/lib/utils/api-handler";
import {
    ForbiddenError,
    InternalServerError,
    ProjectNotFoundError,
    Success,
    UnauthorizedError,
    BodyFieldError,
    validate,
    SuccessNoContent,
} from "@src/lib/utils/api-utils";

import z from "zod";

type Query = z.infer<typeof QuerySchema>;
const QuerySchema = z.object({
    projectId: z.string(),
});

export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;
const UpdateProjectBodySchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    poster: z.string().optional(),
    characters: z.any().optional(),
});

async function projectIdRoute(req: NextApiRequest, res: NextApiResponse) {
    const query = validate(QuerySchema, req.query);

    const user = await getCookieUser(req, res);
    if (!user || !user.id) {
        throw new UnauthorizedError();
    }

    switch (req.method) {
        case "GET":
            return getProject(user.id, query, res);
        case "PATCH":
            const body = validate(UpdateProjectBodySchema, req.body);
            return updateProject(user.id, query, body, res);
        case "DELETE":
            return deleteProject(user.id, query, res);
    }
}

/**
 * GET `/projects/[projectId]`
 *
 * Gets project information from authenticated user
 */
async function getProject(userId: number, query: Query, res: NextApiResponse) {
    const { projectId } = query;

    const membership = await ProjectService.getMembership(projectId, userId);

    if (!membership) {
        throw new ProjectNotFoundError();
    }

    return Success(res, membership);
}

/**
 * PATCH `/projects/[projectId]`
 *
 * Updates project information from authenticated user
 */
async function updateProject(userId: number, query: Query, body: UpdateProjectBody, res: NextApiResponse) {
    const { projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new ProjectNotFoundError();
    }

    const { title, description, poster, characters } = body;
    if (title && (title.length < 1 || title.length > 256)) {
        throw new BodyFieldError("Title must be between 1 and 256 characters");
    }
    if (description && description.length > 2048) {
        throw new BodyFieldError("Description must be at most 2048-character long");
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.EDITOR)) {
        throw new ForbiddenError();
    }

    let hasPoster = false;
    if (poster) {
        hasPoster = await S3.upload(`poster-${projectId}`, poster);
    }

    const updated = await ProjectService.update({
        projectId,
        title,
        description,
        characters,
        hasPoster,
    });

    if (!updated) {
        throw new InternalServerError();
    }

    return Success(res, updated);
}

/**
 * DELETE `/projects/[projectId]`
 *
 * Deletes project from unautheticated user
 */
async function deleteProject(userId: number, query: Query, res: NextApiResponse) {
    const { projectId } = query;

    const member = await ProjectService.getMembership(projectId, userId);
    if (!member) {
        throw new ProjectNotFoundError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.OWNER)) {
        throw new ForbiddenError();
    }

    const deleted = await ProjectService.destroy(projectId);
    if (!deleted) {
        throw new InternalServerError();
    }

    if (member.project.poster) {
        S3.destroy(projectId);
    }

    return SuccessNoContent(res);
}

export default apiHandler(projectIdRoute);
