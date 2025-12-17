import { SecretCreation } from "@src/server/repository/user-repository";
import crypto from "crypto";
import argon2 from "argon2";

export const generateToken = (length: number = 32) => {
    return crypto.randomBytes(length).toString("hex");
};

export const hashPassword = async (password: string): Promise<string> => {
    return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
    });
};

export const checkPassword = async (passwordA: string, passwordB: string): Promise<boolean> => {
    if (!passwordA || !passwordB) {
        return false;
    }
    try {
        return await argon2.verify(passwordA, passwordB);
    } catch (error) {
        return false;
    }
};

export const isHashValid = (hashA: string | null | undefined, hashB: string | null | undefined): boolean => {
    if (!hashA || !hashB || typeof hashA !== "string" || typeof hashB !== "string") {
        return false;
    }

    const bufHashA = Buffer.from(hashA);
    const bufHashB = Buffer.from(hashB);

    if (bufHashA.length !== bufHashB.length) {
        return false;
    }

    const isValid = crypto.timingSafeEqual(new Uint8Array(bufHashA), new Uint8Array(bufHashB));
    return isValid;
};

export const createSecrets = async (password: string): Promise<SecretCreation> => {
    const emailHash = generateToken();
    const hashedPassword = await hashPassword(password);

    return {
        password: hashedPassword,
        emailHash,
    };
};
