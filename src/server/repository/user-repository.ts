import { UserSettings } from "@src/lib/utils/types";
import { Prisma, SubscriptionProvider } from "../../generated/client/client";
import prisma from "../db";

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
    isSubscriptionCancelled?: boolean;
    subscriptionProvider?: SubscriptionProvider | null;
    settings?: Partial<UserSettings>;
}

export interface UserCreation {
    email: string;
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
                isSubscriptionCancelled: userUpdate.isSubscriptionCancelled,
                subscriptionProvider: userUpdate.subscriptionProvider,
            },
        });
    }

    createUser(user: UserCreation) {
        return prisma.user.create({
            data: {
                email: user.email,
                emailVerified: new Date(),
            },
        });
    }

    deleteUser(idOrEmail: idOrEmailType) {
        return prisma.user.delete({
            where: idOrEmail,
        });
    }

    fetchUser(idOrEmail: idOrEmailType) {
        return prisma.user.findUnique({
            where: idOrEmail,
            select: {
                id: true,
                email: true,
                emailVerified: true,
                createdAt: true,
                settings: true,
                username: true,
                color: true,
                role: true,
                isProUntil: true,
                isSubscriptionCancelled: true,
                subscriptionProvider: true,
            },
        });
    }

    countAll() {
        return prisma.user.count();
    }

    countActivePro(now: Date = new Date()) {
        return prisma.user.count({
            where: { isProUntil: { gt: now } },
        });
    }

    searchUsers(term: string, limit: number, cursor?: number) {
        const where: Prisma.UserWhereInput | undefined = term
            ? (/^[0-9a-f-]{30,}$/i.test(term)
                ? { OR: [{ id: term }, { email: { contains: term, mode: "insensitive" } }] }
                : { email: { contains: term, mode: "insensitive" } })
            : undefined;

        return prisma.user.findMany({
            ...(where && { where }),
            orderBy: { createdAt: "desc" },
            take: limit,
            ...(cursor !== undefined && { skip: cursor }),
            select: {
                id: true,
                email: true,
                createdAt: true,
                role: true,
                isProUntil: true,
                subscriptionProvider: true,
            },
        });
    }

    /** Find the user who owns a given Stripe subscription ID. */
    fetchUserByStripeSubscriptionId(subscriptionId: string) {
        return prisma.transaction.findFirst({
            where: { transactionId: subscriptionId, provider: "STRIPE" },
            select: { userId: true },
        });
    }

    /** Get the most recent Stripe subscription ID for a user (for cancellation). */
    fetchStripeSubscriptionId(userId: string) {
        return prisma.transaction.findFirst({
            where: { userId, provider: "STRIPE" },
            orderBy: { createdAt: "desc" },
            select: { transactionId: true },
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
