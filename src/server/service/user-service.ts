import { UserRepository, UserUpdate } from "../repository/user-repository";
import crypto from "crypto";

const repository = new UserRepository();

export async function checkPassword(email: string, password: string) {
    const secrets = await getSecretsFromEmail(email);
    if (!secrets) {
        return false;
    }

    const hash = crypto
        .pbkdf2Sync(password, secrets.salt, 1000, 64, "sha512")
        .toString("hex");

    if (hash !== secrets.hash) {
        return false;
    }
    return true;
}

export async function createUser(email: string, password: string) {
    const emailHash = crypto.randomBytes(64).toString("hex");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .pbkdf2Sync(password, salt, 1000, 64, "sha512")
        .toString("hex");

    const created = await repository.createUser({
        email,
        emailHash,
        hash,
        salt,
    });

    return created;
}

export async function updateUser(user: UserUpdate) {
    return repository.updateUser(user);
}

export async function deleteUser(email: string) {
    return repository.deleteUser(email);
}

export async function getUserFromId(userId: number) {
    return repository.fetchUser({ id: userId });
}

export async function getUserFromEmail(email: string) {
    return repository.fetchUser({ email });
}

export async function getSecretsFromEmail(email: string) {
    return repository.fetchSecrets({ email: email });
}

export async function getSecretsFromId(id: number) {
    return repository.fetchSecrets({ id: id });
}
