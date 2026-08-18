/**
 * GDPR data-access export.
 *
 * Bundles the personal data the database actually links to a user — account
 * info/settings and project memberships — into a zip on R2:
 *
 *   user.json        — account info + settings
 *   memberships.json — every project membership with its role
 *
 * Project content (uploaded assets, comments) is deliberately not attributed
 * to users in the database — it belongs to the project — so there is nothing
 * per-project to bundle.
 *
 * The archive is downloaded from the account settings, which read
 * `getDataExportState` and hit `/users/export/download` with the session — the
 * bytes never leave the server behind anything but a logged-in request. The
 * email that follows is a notification only: it carries no link to the data, so
 * it is worthless to anyone who intercepts it, and it lets the account holder
 * notice an export they did not ask for.
 *
 * fflate's async `zip` compresses in a worker thread and the job runs after
 * the response (`after`), so requests never block the event loop.
 */

import { zip, strToU8, type Zippable } from "fflate";

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as UserService from "@src/server/service/user-service";
import { sendDataExportEmail } from "@src/lib/mail/mail";
import { ConflictError, NotFoundError, TooManyRequestsError } from "@src/lib/utils/api-utils";
import { logger } from "@src/lib/utils/logger";
import { DataExportStatus } from "@src/generated/client/client";
import type { DataExportState } from "@src/lib/utils/types";
import { DataExportRepository } from "../repository/data-export-repository";

const repository = new DataExportRepository();

/** How long a completed export stays downloadable. */
const EXPORT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A PENDING row older than this is a crash leftover, not a running job. */
const PENDING_STALE_MS = 60 * 60 * 1000;
/** One export per user per hour: bundling and mailing is not free, and a second
 *  request minutes after the first only ever produces the same zip again. */
const EXPORT_COOLDOWN_MS = 60 * 60 * 1000;

const zipAsync = (data: Zippable): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        zip(data, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
    });

/**
 * Validate and record a new export request. Throws ConflictError while a
 * request is still building and TooManyRequestsError while the cooldown of the
 * last one has not lapsed. Returns the export id for `runDataExport`.
 */
export async function beginDataExport(userId: string): Promise<string> {
    const now = Date.now();
    await repository.failStalePending(userId, new Date(now - PENDING_STALE_MS));

    const recent = await repository.findLatestSince(userId, new Date(now - EXPORT_COOLDOWN_MS));
    if (recent) {
        if (recent.status === DataExportStatus.PENDING)
            throw new ConflictError("A data export is already being prepared");
        throw new TooManyRequestsError("A data export was requested less than an hour ago");
    }

    const row = await repository.createPending(userId);
    return row.id;
}

/** Resolve what the settings panel should show, without mutating anything. */
export async function getDataExportState(userId: string): Promise<DataExportState> {
    const now = Date.now();
    const [latest, downloadable] = await Promise.all([
        repository.findLatest(userId),
        repository.findLatestDownloadable(userId, new Date(now)),
    ]);

    // A PENDING row past the stale cutoff is a crash leftover. `beginDataExport`
    // fails it on the next request; a read must not show it as still running.
    const isPreparing =
        latest?.status === DataExportStatus.PENDING &&
        latest.createdAt.getTime() > now - PENDING_STALE_MS;

    // Mirrors the guard in `beginDataExport` so the button and the API agree on
    // when a request is allowed. Safe because a stale PENDING is necessarily
    // older than the cooldown too (PENDING_STALE_MS === EXPORT_COOLDOWN_MS).
    const blocking = latest && latest.status !== DataExportStatus.FAILED ? latest : null;
    const cooldownEnd = blocking ? blocking.createdAt.getTime() + EXPORT_COOLDOWN_MS : 0;

    const status: DataExportState["status"] = isPreparing
        ? "PENDING"
        : downloadable
          ? "READY"
          : latest?.status === DataExportStatus.COMPLETED
            ? "EXPIRED"
            : "NONE";

    return {
        id: downloadable?.id ?? null,
        status,
        expiresAt: downloadable?.expiresAt?.toISOString() ?? null,
        canRequestAt: cooldownEnd > now ? new Date(cooldownEnd).toISOString() : null,
    };
}

/**
 * Read a completed export on behalf of the signed-in caller. Everything that
 * makes the archive unavailable — someone else's export, an id that does not
 * exist, a run that never completed, a lapsed link — answers with the same 404,
 * so the endpoint never confirms an export id to whoever is holding the link.
 */
export async function getExportArchive(
    exportId: string,
    userId: string,
): Promise<{ bytes: Uint8Array; filename: string }> {
    const record = await repository.findById(exportId);
    const unavailable = new NotFoundError("This data export is no longer available");

    if (!record || record.userId !== userId) throw unavailable;
    if (record.status !== DataExportStatus.COMPLETED || !record.key) throw unavailable;
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) throw unavailable;

    const bytes = await S3.getObjectBytes(record.key);
    if (!bytes) throw unavailable;

    return { bytes, filename: record.key.split("/").pop() ?? "scriptio-data-export.zip" };
}

/** Delete the R2 objects of exports whose download link has already lapsed. */
async function purgeExpiredExports(userId: string): Promise<void> {
    const expired = await repository.findExpired(userId, new Date());
    const keys = expired.map((e) => e.key).filter((key): key is string => !!key);
    if (!keys.length) return;

    await S3.destroyMany(keys);
    await repository.clearKeys(expired.map((e) => e.id));
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

        // Reclaim the zips of lapsed exports only. Wiping the whole prefix would
        // break the links of earlier emails that are still within their 7 days.
        await purgeExpiredExports(userId);

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

        const expiresAt = new Date(Date.now() + EXPORT_LINK_TTL_MS);
        await repository.markCompleted(exportId, key, expiresAt);
        await sendDataExportEmail(user.email);
        logger.info("[DataExport] Export completed", { userId, exportId, key });
    } catch (e) {
        logger.error("[DataExport] Export failed", { userId, exportId, error: e });
        await repository.markFailed(exportId).catch(() => {});
    }
}
