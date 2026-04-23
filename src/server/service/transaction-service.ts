import { TransactionRepository } from "../repository/transaction-repository";

const repository = new TransactionRepository();

export const getTransactionsByUser = async (userId: string) => {
    return repository.fetchByUser(userId);
};

export const countTransactionsByUser = async (userId: string) => {
    return repository.countByUser(userId);
};

export const countTransactionsSince = async (since: Date) => {
    return repository.countSince(since);
};
