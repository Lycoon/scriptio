import { UserRepository, UserUpdate } from "../repository/user-repository";

const repository = new UserRepository();

export const createUser = async (email: string) => {
    return repository.createUser({ email });
};

export const setVerified = async (userId: string) => {
    return repository.updateUserFromId(userId, { emailVerified: new Date() });
};

export const updateUserFromId = async (userId: string, userUpdate: UserUpdate) => {
    return repository.updateUserFromId(userId, userUpdate);
};

export const deleteUserFromId = async (userId: string) => {
    return repository.deleteUser({ id: userId });
};

export const getUserFromId = async (userId: string) => {
    return repository.fetchUser({ id: userId });
};

export const getUserFromEmail = async (email: string) => {
    return repository.fetchUser({ email });
};

export const getUserSettings = async (userId: string) => {
    return repository.fetchUserSettings(userId);
};

export const getUserByStripeSubscriptionId = async (subscriptionId: string) => {
    return repository.fetchUserByStripeSubscriptionId(subscriptionId);
};

export const getStripeSubscriptionId = async (userId: string) => {
    const result = await repository.fetchStripeSubscriptionId(userId);
    return result?.transactionId ?? null;
};

