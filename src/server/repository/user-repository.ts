import { UserSettings } from "@src/lib/utils/types";
import { Prisma } from "../../generated/client/client";
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
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
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
                stripeCustomerId: userUpdate.stripeCustomerId,
                stripeSubscriptionId: userUpdate.stripeSubscriptionId,
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

    /** Auth.js sign-in tokens, keyed by email rather than by a FK to User. */
    deleteVerificationTokens(email: string) {
        return prisma.verificationToken.deleteMany({ where: { identifier: email } });
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
            },
        });
    }

    /** Find the user who owns a given Stripe subscription ID. */
    fetchUserByStripeSubscriptionId(stripeSubscriptionId: string) {
        return prisma.user.findUnique({
            where: { stripeSubscriptionId },
            select: { id: true },
        });
    }

    /** Kept out of fetchUser: that select is what /api/users hands to the browser. */
    fetchStripeIds(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: { stripeCustomerId: true, stripeSubscriptionId: true },
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
