import { UpdateSecrets } from "@src/server/repository/user-repository";
import crypto from "crypto";

export const generateHexToken = (length: number = 64) => {
    return crypto.randomBytes(length).toString("hex");
};

export const hashPassword = (password: string, salt: string) => {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
};

export const checkPassword = async (secrets: any, password: string) => {
    if (!secrets || !password) {
        return false;
    }
    try {
        const hash = hashPassword(password, secrets.salt);
        return hash === secrets.hash;
    } catch (error) {
        return false;
    }
};

export const generateSecrets = (password: string): UpdateSecrets => {
    const recoverHash = generateHexToken();
    const emailHash = generateHexToken();
    const salt = generateHexToken(16);
    const hash = hashPassword(password, salt);

    return {
        hash,
        salt,
        emailHash,
        recoverHash,
        lastEmailHash: new Date(),
        lastRecoverHash: new Date(),
    };
};
