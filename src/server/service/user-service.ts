import { SecretCreation, UpdateSecrets, UserRepository, UserUpdate } from "../repository/user-repository";

import * as SecretService from "../../lib/utils/secrets";

const repository = new UserRepository();

export const updateRecoveryHash = async (userId: number) => {
    const recoverHash = SecretService.generateToken();

    updateUser({
        id: { id: userId },
        secrets: {
            recoverHash,
            lastRecoverHash: new Date(),
        },
    });

    return recoverHash;
};

export const updateEmailHash = async (userId: number) => {
    const emailHash = SecretService.generateToken();

    updateUser({
        id: { id: userId },
        secrets: {
            emailHash,
            lastEmailHash: new Date(),
        },
    });

    return emailHash;
};

export const createUser = async (email: string, secrets: SecretCreation) => {
    const created = await repository.createUser({
        email,
        secrets,
    });

    return created;
};

export const updateUser = async (user: UserUpdate) => {
    return repository.updateUser(user);
};

export const deleteUserFromId = async (userId: number) => {
    return repository.deleteUser({ id: userId });
};

export const getUserFromId = async (userId: number, includeSecrets = false) => {
    return repository.fetchUser({ id: userId }, includeSecrets);
};

export const getUserFromEmail = async (email: string, includeSecrets = false) => {
    return repository.fetchUser({ email }, includeSecrets);
};
