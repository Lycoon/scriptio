import { SubscriptionProvider } from "../../generated/client/client";
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

    findByTransactionId(transactionId: string) {
        return prisma.transaction.findFirst({
            where: { transactionId },
            select: { userId: true },
        });
    }

    createIfNotExists(userId: string, provider: SubscriptionProvider, transactionId: string) {
        return prisma.transaction.upsert({
            where: { transactionId },
            update: {},
            create: { userId, provider, transactionId },
        });
    }
}
