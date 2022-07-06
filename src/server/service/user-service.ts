import {
    Secrets,
    UserRepository,
    UserUpdate,
} from "../repository/user-repository";
import crypto from "crypto";
import { sendVerificationEmail } from "../../lib/mail/mail";

const repository = new UserRepository();

export async function checkPassword(secrets: any, password: string) {
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

export function generateSecrets(password: string): Secrets {
    const emailHash = crypto.randomBytes(64).toString("hex");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .pbkdf2Sync(password, salt, 1000, 64, "sha512")
        .toString("hex");

    return { hash, salt, emailHash };
}

export async function createUser(email: string, password: string) {
    const secrets = generateSecrets(password);
    const created = await repository.createUser({
        email,
        emailHash: secrets.emailHash,
        hash: secrets.hash,
        salt: secrets.salt,
    });
    sendVerificationEmail(created.id, email, secrets.emailHash);

    return created;
}

export async function updateUser(user: UserUpdate) {
    return repository.updateUser(user);
}

export async function deleteUserFromId(userId: number) {
    return repository.deleteUser({ id: userId });
}

export async function getUserFromId(userId: number, includeSecrets = false) {
    return repository.fetchUser({ id: userId }, includeSecrets);
}

export async function getUserFromEmail(email: string, includeSecrets = false) {
    return repository.fetchUser({ email }, includeSecrets);
}
