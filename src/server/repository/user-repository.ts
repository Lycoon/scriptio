import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface UserUpdate {
    email?: string;
    emailHash?: string;
    salt?: string;
    hash?: string;
    active?: boolean;
}

export interface UserCreation {
    email: string;
    emailHash: string;
    salt: string;
    hash: string;
}

type idOrEmailType = { id: number } | { email: string };

const userQuerySelect = {
    id: true,
    email: true,
    active: true,
    createdAt: true,
};

export class UserRepository {
    updateUser(user: UserUpdate) {
        return prisma.user.update({
            data: {
                email: user.email,
                salt: user.salt,
                hash: user.hash,
                emailHash: user.emailHash,
                active: user.active,
            },
            where: {
                email: user.email,
            },
        });
    }

    createUser(user: UserCreation) {
        return prisma.user.create({
            data: {
                email: user.email,
                salt: user.salt,
                hash: user.hash,
                emailHash: user.emailHash,
            },
        });
    }

    deleteUser(email: string) {
        return prisma.user.delete({
            where: {
                email,
            },
        });
    }

    fetchUser(idOrEmail: idOrEmailType) {
        return prisma.user.findUnique({
            where: idOrEmail,
            select: userQuerySelect,
        });
    }

    fetchSecrets(idOrEmail: idOrEmailType) {
        return prisma.user.findUnique({
            where: idOrEmail,
            select: {
                emailHash: true,
                hash: true,
                salt: true,
            },
        });
    }
}
