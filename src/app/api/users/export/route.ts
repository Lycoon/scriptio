import { NextRequest, after } from "next/server";

import * as GdprExportService from "@src/server/service/gdpr-export-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { Success } from "@src/lib/utils/api-utils";

/**
 * POST `/users/export`
 *
 * GDPR data-access request. Records the request and returns immediately; the
 * zip is bundled in the background (`after`) and a signed download link, valid
 * 7 days, is emailed to the user. 409 while a previous request is still
 * building.
 */
async function requestDataExport(req: NextRequest, { user }: AuthApiContext) {
    const exportId = await GdprExportService.beginDataExport(user.id);
    after(() => GdprExportService.runDataExport(exportId, user.id));
    return Success({ requested: true });
}

export const POST = apiHandler(requestDataExport);
