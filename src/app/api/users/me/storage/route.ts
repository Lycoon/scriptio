import { NextRequest } from "next/server";

import * as ProjectService from "@src/server/service/project-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";
import { USER_STORAGE_QUOTA_BYTES } from "@src/lib/utils/storage-limits";

/**
 * GET `/users/me/storage`
 *
 * The authenticated user's total cloud-asset usage across the projects they own,
 * plus the quota. Used for the promote-to-cloud pre-check.
 */
async function getMyStorage(_req: NextRequest, { user }: AuthApiContext) {
    const used = await ProjectService.getOwnerStorageUsed(user.id);
    return Success({ used, quota: USER_STORAGE_QUOTA_BYTES });
}

export const GET = apiHandler(getMyStorage);
