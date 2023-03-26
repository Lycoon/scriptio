import { Secrets, UserRepository, UserUpdate } from "../repository/user-repository";
import crypto from "crypto";
import { sendVerificationEmail } from "../../lib/mail/mail";

const repository = new UserRepository();

export const updateUserRecoveryHash = async (userId: number) => {
    const recoverHash = crypto.randomBytes(64).toString("hex");
    const secrets: Secrets = { recoverHash, lastRecoverHash: new Date() };

    updateUser({
        id: { id: userId },
        secrets,
    });

    return recoverHash;
};

export const checkPassword = async (secrets: any, password: string) => {
    if (!secrets || !password) {
        return false;
    }

    const hash = crypto.pbkdf2Sync(password, secrets.salt, 1000, 64, "sha512").toString("hex");
    return hash === secrets.hash;
};

export const generateSecrets = (password: string): Secrets => {
    const recoverHash = crypto.randomBytes(64).toString("hex");
    const emailHash = crypto.randomBytes(64).toString("hex");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");

    return {
        hash,
        salt,
        emailHash,
        recoverHash,
        lastEmailHash: new Date(),
        lastRecoverHash: new Date(),
    };
};

export const createUser = async (email: string, password: string) => {
    const secrets = generateSecrets(password);
    const created = await repository.createUser({
        email,
        secrets,
    });
    sendVerificationEmail(created.id, email, secrets.emailHash!);

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
