import { SecretCreation, UpdateSecrets, UserRepository, UserUpdate } from "../repository/user-repository";

import * as SecretService from "../../lib/utils/secrets";

const repository = new UserRepository();

export const updateRecoveryHash = async (userId: string) => {
    const recoverHash = SecretService.generateToken();

    updateUserFromId(userId, {
        secrets: {
            recoverHash,
            lastRecoverHash: new Date(),
        },
    });

    return recoverHash;
};

export const updateEmailHash = async (userId: string) => {
    const emailHash = SecretService.generateToken();

    updateUserFromId(userId, {
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

export const updateUserFromId = async (userId: string, userUpdate: UserUpdate) => {
    return repository.updateUserFromId(userId, userUpdate);
};

export const deleteUserFromId = async (userId: string) => {
    return repository.deleteUser({ id: userId });
};

export const getUserFromId = async (userId: string, includeSecrets = false) => {
    return repository.fetchUser({ id: userId }, includeSecrets);
};

export const getUserFromEmail = async (email: string, includeSecrets = false) => {
    return repository.fetchUser({ email }, includeSecrets);
};

export const getUserSettings = async (userId: string) => {
    return repository.fetchUserSettings(userId);
}