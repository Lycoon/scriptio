import { SecretCreation } from "@src/server/repository/user-repository";
import crypto from "crypto";
import argon2 from "argon2";
import prisma from "@src/server/db";

export const generateToken = (length: number = 32) => {
    return crypto.randomBytes(length).toString("hex");
};

export const hashToken = (token: string) => {
    return crypto.createHash("sha256").update(token).digest("hex");
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

export const createSecrets = async (password: string): Promise<SecretCreation> => {
    const hashedPassword = await hashPassword(password);

    return {
        password: hashedPassword,
    };
};

export const updatePassword = async (userId: string, newPassword: string) => {
    const hashed = await hashPassword(newPassword);
    return prisma.secret.update({
        where: { userId },
        data: { password: hashed },
    });
};
