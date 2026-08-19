import { ProjectRole } from "../../../../generated/client/client";

import * as ProjectService from "@src/server/service/project-service";
import * as Roles from "@src/lib/utils/roles";
import { destroyProjectCompletely } from "@src/server/service/project-teardown-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import {
    ForbiddenError,
    InternalServerError,
    ProjectNotFoundError,
    Success,
    BodyFieldError,
    validate,
    SuccessNoContent,
} from "@src/lib/utils/api-utils";

import z from "zod";
import { NextRequest } from "next/server";
import { UpdateProjectBodySchema } from "@src/lib/utils/api-bodies";
export type { UpdateProjectBody } from "@src/lib/utils/api-bodies";

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * GET `/projects/[projectId]`
 *
 * Gets project information from authenticated user
 */
async function getProject(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const membership = await ProjectService.getMembership(projectId, user.id);

    if (!membership) {
        throw new ProjectNotFoundError();
    }

    return Success(membership);
}

/**
 * PATCH `/projects/[projectId]`
 *
 * Updates project information from authenticated user
 */
async function updateProject(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);

    if (!member) {
        throw new ProjectNotFoundError();
    }

    const body = await req.json();
    const { title, description, author } = validate(UpdateProjectBodySchema, body);

    if (title && (title.length < 1 || title.length > 256)) {
        throw new BodyFieldError("Title must be between 1 and 256 characters");
    }
    if (description && description.length > 2048) {
        throw new BodyFieldError("Description must be at most 2048-character long");
    }
    if (author && author.length > 256) {
        throw new BodyFieldError("Author must be at most 256-character long");
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.EDITOR)) {
        throw new ForbiddenError();
    }

    // `hasPoster` is deliberately left alone: the poster is owned by
    // `PUT /projects/[projectId]/poster`, and folding it in here used to reset
    // the flag to false on every unrelated edit.
    const updated = await ProjectService.update({
        projectId,
        title,
        description,
        author,
    });

    if (!updated) {
        throw new InternalServerError();
    }

    return Success(updated);
}

/**
 * DELETE `/projects/[projectId]`
 *
 * Deletes project from authenticated user
 */
async function deleteProject(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const { projectId } = validate(QuerySchema, routeParams);
    const member = await ProjectService.getMembership(projectId, user.id);

    if (!member) {
        throw new ForbiddenError();
    }

    if (!Roles.hasRoleOrGreater(member.role, ProjectRole.OWNER)) {
        throw new ForbiddenError();
    }

    await destroyProjectCompletely(projectId);

    return SuccessNoContent();
}

export const GET = apiHandler(getProject);
export const PATCH = apiHandler(updateProject);
export const DELETE = apiHandler(deleteProject);
