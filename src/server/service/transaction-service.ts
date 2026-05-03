import { SubscriptionProvider } from "../../generated/client/client";
import { TransactionRepository } from "../repository/transaction-repository";
import { logger } from "@src/lib/utils/logger";

const repository = new TransactionRepository();

export const getTransactionsByUser = async (userId: string) => {
    logger.debug("[TransactionService] Fetching transactions", { userId });
    return repository.fetchByUser(userId);
};

export const countTransactionsByUser = async (userId: string) => {
    logger.debug("[TransactionService] Counting transactions", { userId });
    return repository.countByUser(userId);
};

export const countTransactionsSince = async (since: Date) => {
    logger.debug("[TransactionService] Counting transactions since", { since });
    return repository.countSince(since);
};

export const findUserByTransactionId = async (transactionId: string) => {
    logger.debug("[TransactionService] Looking up user by transactionId", { transactionId });
    const result = await repository.findByTransactionId(transactionId);
    if (result) {
        logger.debug("[TransactionService] Found user for transaction", { transactionId, userId: result.userId });
    } else {
        logger.debug("[TransactionService] No user found for transaction", { transactionId });
    }
    return result;
};

export const createTransactionIfNotExists = async (
    userId: string,
    provider: SubscriptionProvider,
    transactionId: string,
) => {
    logger.debug("[TransactionService] Creating transaction if not exists", { userId, provider, transactionId });
    const result = await repository.createIfNotExists(userId, provider, transactionId);
    logger.debug("[TransactionService] Transaction upserted", { id: result.id, transactionId });
    return result;
};

export const reassignTransactionToUser = async (transactionId: string, newUserId: string) => {
    logger.debug("[TransactionService] Reassigning transaction", { transactionId, newUserId });
    return repository.reassignToUser(transactionId, newUserId);
};
