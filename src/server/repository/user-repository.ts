import { UserSettings } from "@src/lib/utils/types";
import { Prisma } from "@prisma/client";
import prisma from "../db";

export type UpdateSecrets = {
    password?: string;
    emailHash?: string | null;
    recoverHash?: string | null;
    lastEmailHash?: Date;
    lastRecoverHash?: Date;
};

export type UpdateSettings = {
    highlightOnHover?: boolean;
    sceneBackground?: boolean;
    notesColor?: string;
    exportedNotesColor?: string;
    onlineUsername?: string;
    onlineColor?: string;
};

export interface UserUpdate {
    email?: string;
    verified?: boolean;
    secrets?: UpdateSecrets;
    settings?: Partial<UserSettings>;
}

export interface UserCreation {
    email: string;
    secrets: SecretCreation;
}

export interface SecretCreation {
    password: string;
    emailHash: string;
}

type idOrEmailType = { id: string } | { email: string };

export class UserRepository {
    updateUserFromId(userId: string, userUpdate: UserUpdate) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                email: userUpdate.email,
                verified: userUpdate.verified,
                secrets: {
                    update: userUpdate.secrets,
                },
                settings: userUpdate.settings as Prisma.InputJsonValue,
            },
        });
    }

    createUser(user: UserCreation) {
        return prisma.user.create({
            data: {
                email: user.email,
                secrets: {
                    create: {
                        password: user.secrets.password,
                        emailHash: user.secrets.emailHash,
                    },
                },
                settings: {
                    create: {},
                },
            },
        });
    }

    deleteUser(idOrEmail: idOrEmailType) {
        return prisma.user.delete({
            where: idOrEmail,
        });
    }

    fetchUser(idOrEmail: idOrEmailType, includeSecrets = false) {
        const userQuerySelect = {
            id: true,
            email: true,
            verified: true,
            createdAt: true,
            settings: true,
            secrets: includeSecrets,
        };

        return prisma.user.findUnique({
            where: idOrEmail,
            select: userQuerySelect,
        });
    }

    fetchUserSettings(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: {
                settings: true,
            },
        });
    }
}
