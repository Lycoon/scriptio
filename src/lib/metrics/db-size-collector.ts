import prisma from "../../server/db";
import { dbSizeBytes } from "./registry";

const POLL_INTERVAL_MS = 30_000;

declare global {
    // eslint-disable-next-line no-var
    var __scriptio_db_size_timer__: NodeJS.Timeout | undefined;
}

const refreshDbSize = async () => {
    try {
        const rows = await prisma.$queryRaw<{ size: bigint }[]>`
            SELECT pg_database_size(current_database())::bigint AS size
        `;
        const size = rows[0]?.size;
        if (size !== undefined) dbSizeBytes.set(Number(size));
    } catch (err) {
        console.error("[metrics] Failed to refresh DB size:", err);
    }
};

export const startDbSizeCollector = () => {
    if (globalThis.__scriptio_db_size_timer__) return;
    void refreshDbSize();
    globalThis.__scriptio_db_size_timer__ = setInterval(refreshDbSize, POLL_INTERVAL_MS);
};
