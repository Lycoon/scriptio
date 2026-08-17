import { DataExportStatus } from "../../generated/client/client";
import prisma from "../db";

export class DataExportRepository {
    createPending(userId: string) {
        return prisma.dataExport.create({ data: { userId } });
    }

    /** The user's PENDING export created after `since`, if any (duplicate-request guard). */
    findActivePending(userId: string, since: Date) {
        return prisma.dataExport.findFirst({
            where: { userId, status: DataExportStatus.PENDING, createdAt: { gte: since } },
        });
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
