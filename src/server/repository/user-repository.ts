import { UserSettings } from "@src/lib/utils/types";
import { Prisma } from "@prisma/client";
import prisma from "../db";

export type UpdateSecrets = {
    password?: string;
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
    emailVerified?: Date | null;
    username?: string;
    color?: string;
    isProUntil?: Date | null;
    stripeSubscriptionId?: string | null;
    isSubscriptionCancelled?: boolean;
    secrets?: UpdateSecrets;
    settings?: Partial<UserSettings>;
}

export interface UserCreation {
    email: string;
    secrets: SecretCreation;
}

export interface SecretCreation {
    password: string;
}

type idOrEmailType = { id: string } | { email: string };

export class UserRepository {
    updateUserFromId(userId: string, userUpdate: UserUpdate) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                email: userUpdate.email,
                emailVerified: userUpdate.emailVerified,
                settings: userUpdate.settings as Prisma.InputJsonValue,
                username: userUpdate.username,
                color: userUpdate.color,
                isProUntil: userUpdate.isProUntil,
                stripeSubscriptionId: userUpdate.stripeSubscriptionId,
                isSubscriptionCancelled: userUpdate.isSubscriptionCancelled,
                secrets: userUpdate.secrets
                    ? {
                          update: userUpdate.secrets,
                      }
                    : undefined,
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
                    },
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
            emailVerified: true,
            createdAt: true,
            settings: true,
            username: true,
            color: true,
            isProUntil: true,
            isSubscriptionCancelled: true,
            secrets: includeSecrets,
        };

        return prisma.user.findUnique({
            where: idOrEmail,
            select: userQuerySelect,
        });
    }

    fetchUserBySubscriptionId(subscriptionId: string) {
        return prisma.user.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
            select: { id: true },
        });
    }

    fetchSubscriptionId(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: { stripeSubscriptionId: true },
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
