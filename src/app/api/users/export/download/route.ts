import { NextRequest, NextResponse } from "next/server";

import * as GdprExportService from "@src/server/service/gdpr-export-service";
import { apiHandler, AuthApiContext } from "@src/lib/utils/api-handler";
import { validate } from "@src/lib/utils/api-utils";

import z from "zod";

const QuerySchema = z.object({
    id: z.string(),
});

/**
 * GET `/users/export/download?id=<exportId>`
 *
 * Serves the export zip to the account settings, streamed through the API so
 * the bucket stays private and no pre-signed URL ever leaves the server. The
 * archive is personal data in bulk and reachable only by the signed-in user who
 * requested it — nothing about it is delivered by email.
 */
async function downloadDataExport(req: NextRequest, { searchParams, user }: AuthApiContext) {
    const { id } = validate(QuerySchema, searchParams);

    const { bytes, filename } = await GdprExportService.getExportArchive(id, user.id);

    return new NextResponse(bytes as BodyInit, {
        headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(bytes.byteLength),
            "Content-Disposition": `attachment; filename="${filename}"`,
            // Personal data: no cache may keep a copy of this response.
            "Cache-Control": "no-store, private",
        },
    });
}

export const GET = apiHandler(downloadDataExport);
