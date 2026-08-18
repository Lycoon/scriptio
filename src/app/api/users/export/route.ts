import { NextRequest, after } from "next/server";

import * as GdprExportService from "@src/server/service/gdpr-export-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";

/**
 * GET `/users/export`
 *
 * What the account settings render: whether an export is being prepared, ready
 * to download, or expired, and when a new one may be requested.
 */
async function getDataExportState(req: NextRequest, { user }: AuthApiContext) {
    return Success(await GdprExportService.getDataExportState(user.id));
}

/**
 * POST `/users/export`
 *
 * GDPR data-access request. Records the request and returns immediately; the
 * zip is bundled in the background (`after`) and stays downloadable from the
 * settings for 7 days, with a notification email once it is ready. 409 while a
 * previous request is still building, 429 within an hour of the last one.
 */
async function requestDataExport(req: NextRequest, { user }: AuthApiContext) {
    const exportId = await GdprExportService.beginDataExport(user.id);
    after(() => GdprExportService.runDataExport(exportId, user.id));
    return Success({ requested: true });
}

export const GET = apiHandler(getDataExportState);
export const POST = apiHandler(requestDataExport);
