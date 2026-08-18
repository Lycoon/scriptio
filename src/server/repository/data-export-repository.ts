import { DataExportStatus } from "../../generated/client/client";
import prisma from "../db";

export class DataExportRepository {
    createPending(userId: string) {
        return prisma.dataExport.create({ data: { userId } });
    }

    findById(id: string) {
        return prisma.dataExport.findUnique({ where: { id } });
    }

    /** The user's newest export created after `since` that still counts against
     *  the cooldown. FAILED rows do not, so a failed run can be retried at once. */
    findLatestSince(userId: string, since: Date) {
        return prisma.dataExport.findFirst({
            where: {
                userId,
                status: { not: DataExportStatus.FAILED },
                createdAt: { gte: since },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** The user's most recent export whatever its outcome (drives the UI state). */
    findLatest(userId: string) {
        return prisma.dataExport.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    }

    /** The newest export that can still be downloaded right now. */
    findLatestDownloadable(userId: string, now: Date) {
        return prisma.dataExport.findFirst({
            where: {
                userId,
                status: DataExportStatus.COMPLETED,
                key: { not: null },
                expiresAt: { gt: now },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Exports whose download link has lapsed — their zip is dead weight in R2. */
    findExpired(userId: string, before: Date) {
        return prisma.dataExport.findMany({
            where: { userId, key: { not: null }, expiresAt: { lt: before } },
            select: { id: true, key: true },
        });
    }

    /** Forget the keys of exports whose zips have just been reclaimed. */
    clearKeys(ids: string[]) {
        return prisma.dataExport.updateMany({ where: { id: { in: ids } }, data: { key: null } });
    }

    /** Mark PENDING rows older than `before` FAILED — leftovers of a crashed
     *  server that would otherwise block the user's next request forever. */
    failStalePending(userId: string, before: Date) {
        return prisma.dataExport.updateMany({
            where: { userId, status: DataExportStatus.PENDING, createdAt: { lt: before } },
            data: { status: DataExportStatus.FAILED },
        });
    }

    markCompleted(id: string, key: string, expiresAt: Date) {
        return prisma.dataExport.update({
            where: { id },
            data: { status: DataExportStatus.COMPLETED, key, completedAt: new Date(), expiresAt },
        });
    }

    markFailed(id: string) {
        return prisma.dataExport.update({
            where: { id },
            data: { status: DataExportStatus.FAILED },
        });
    }
}
