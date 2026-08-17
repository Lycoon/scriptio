/**
 * GDPR data-access export.
 *
 * Bundles the personal data the database actually links to a user — account
 * info/settings and project memberships — into a zip on R2 and mails them a
 * signed download link, valid 7 days (the SigV4 maximum):
 *
 *   user.json        — account info + settings
 *   memberships.json — every project membership with its role
 *
 * Project content (uploaded assets, comments) is deliberately not attributed
 * to users in the database — it belongs to the project — so there is nothing
 * per-project to bundle.
 *
 * fflate's async `zip` compresses in a worker thread and the job runs after
 * the response (`after`), so requests never block the event loop.
 */

import { zip, strToU8, type Zippable } from "fflate";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import { sendDataExportEmail } from "@src/lib/mail/mail";
import { ConflictError } from "@src/lib/utils/api-utils";
import { logger } from "@src/lib/utils/logger";
import { DataExportRepository } from "../repository/data-export-repository";

const repository = new DataExportRepository();

const EXPORT_LINK_TTL_SECONDS = S3.MAX_SIGNED_URL_TTL_SECONDS; // 7 days
/** A PENDING row older than this is a crash leftover, not a running job. */
const PENDING_STALE_MS = 60 * 60 * 1000;

const zipAsync = (data: Zippable): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        zip(data, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
    });

/**
 * Validate and record a new export request. Throws ConflictError while a
 * recent request is still building. Returns the export id for `runDataExport`.
 */
export async function beginDataExport(userId: string): Promise<string> {
    const staleBefore = new Date(Date.now() - PENDING_STALE_MS);
    await repository.failStalePending(userId, staleBefore);

    const active = await repository.findActivePending(userId, staleBefore);
    if (active) throw new ConflictError("A data export is already being prepared");

    const row = await repository.createPending(userId);
    return row.id;
}

/**
 * Build the zip, upload it and email the link. Runs in the background after
 * the request already returned — never throws, records FAILED instead.
 */
export async function runDataExport(exportId: string, userId: string): Promise<void> {
    try {
        const user = await UserService.getUserFromId(userId);
        if (!user) throw new Error("User no longer exists");
        const memberships = await ProjectService.getMembershipsWithProject(userId);

        // Only the newest export link should stay valid; this also reclaims the
        // previous zip instead of waiting out its 7 days.
        await S3.destroyPrefix(`gdpr-exports/${userId}/`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const key = `gdpr-exports/${userId}/scriptio-data-export-${timestamp}.zip`;

        const archive = await zipAsync({
            "user.json": strToU8(JSON.stringify(user, null, 2)),
            "memberships.json": strToU8(
                JSON.stringify(
                    memberships.map((m) => ({
                        projectId: m.project.id,
                        title: m.project.title,
                        description: m.project.description,
                        author: m.project.author,
                        role: m.role,
                        projectCreatedAt: m.project.createdAt,
                        projectUpdatedAt: m.project.updatedAt,
                    })),
                    null,
                    2,
                ),
            ),
        });

        const uploaded = await S3.putObject(key, archive, "application/zip");
        if (!uploaded) throw new Error("Failed to upload the export zip");

        const url = await S3.getSignedDownloadUrl(key, EXPORT_LINK_TTL_SECONDS);
        if (!url) throw new Error("Failed to sign the export download URL");

        const expiresAt = new Date(Date.now() + EXPORT_LINK_TTL_SECONDS * 1000);
        await repository.markCompleted(exportId, key, expiresAt);
        await sendDataExportEmail(user.email, url);
        logger.info("[DataExport] Export completed", { userId, exportId, key });
    } catch (e) {
        logger.error("[DataExport] Export failed", { userId, exportId, error: e });
        await repository.markFailed(exportId).catch(() => {});
    }
}
