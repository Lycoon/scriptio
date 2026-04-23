import prisma from "../db";

export class TransactionRepository {
    fetchByUser(userId: string) {
        return prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                provider: true,
                transactionId: true,
                createdAt: true,
            },
        });
    }

    countByUser(userId: string) {
        return prisma.transaction.count({ where: { userId } });
    }

    countSince(since: Date) {
        return prisma.transaction.count({
            where: { createdAt: { gte: since } },
        });
    }
}
