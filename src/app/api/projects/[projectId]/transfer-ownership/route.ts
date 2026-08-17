import { ProjectRole } from "../../../../../generated/client/client";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import {
    BodyFieldError,
    ForbiddenError,
    NotFoundError,
    PaymentRequiredError,
    ProjectNotFoundError,
    Success,
    validate,
} from "@src/lib/utils/api-utils";
import { isProActive } from "@src/lib/utils/pro-utils";

import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import * as CollabUtils from "@src/lib/cloud/utils";

import z from "zod";
import { NextRequest } from "next/server";
import { TransferOwnershipSchema } from "@src/lib/utils/api-bodies";
export type { TransferOwnershipBody } from "@src/lib/utils/api-bodies";

/** The role the outgoing owner keeps. Mirrors the copy in the danger zone. */
const PREVIOUS_OWNER_ROLE = ProjectRole.EDITOR;

const QuerySchema = z.object({
    projectId: z.string(),
});

/**
 * POST `/projects/[projectId]/transfer-ownership`
 *
 * Hands the OWNER role to another member of the project. The caller is demoted
 * to editor in the same transaction, so the project always has exactly one owner.
 */
async function transferOwnership(req: NextRequest, { routeParams, user }: AuthApiContext) {
    const body = await req.json();
    const { userId: newOwnerId } = validate(TransferOwnershipSchema, body);
    const { projectId } = validate(QuerySchema, routeParams);

    if (newOwnerId === user.id) throw new BodyFieldError("You already own this project");

    const member = await ProjectService.getMembership(projectId, user.id);
    if (!member) {
        throw new ProjectNotFoundError();
    }
    if (member.role !== ProjectRole.OWNER) {
        throw new ForbiddenError("Only the owner can transfer ownership");
    }

    // Ownership can only move to an existing member: the new owner needs project
    // access anyway, and going through the invite flow keeps that an explicit,
    // accepted step rather than something the outgoing owner can force.
    const newOwnerMembership = await ProjectService.getMembership(projectId, newOwnerId);
    if (!newOwnerMembership) {
        throw new NotFoundError("The new owner must be a member of this project");
    }

    // The owner is the quota holder for the project's cloud assets (see the asset
    // upload route), so handing the project to a free account would silently break
    // uploads for the whole team.
    const newOwner = await UserService.getUserFromId(newOwnerId);
    if (!newOwner) {
        throw new NotFoundError("The new owner must be a member of this project");
    }
    if (!isProActive(newOwner.isProUntil)) {
        throw new PaymentRequiredError("The new owner needs an active Pro subscription");
    }

    await ProjectService.transferOwnership(projectId, user.id, newOwnerId, PREVIOUS_OWNER_ROLE);

    // Push both role changes to any live WS so the server-side write gate and the
    // client UI flip immediately, instead of after a refresh (same reason as the
    // member role PATCH).
    await CollabUtils.notifyRoleChange(newOwnerId, projectId, ProjectRole.OWNER);
    await CollabUtils.notifyRoleChange(user.id, projectId, PREVIOUS_OWNER_ROLE);

    return Success({ ownerId: newOwnerId, previousOwnerRole: PREVIOUS_OWNER_ROLE });
}

export const POST = apiHandler(transferOwnership);
