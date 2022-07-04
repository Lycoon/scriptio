import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type Secrets = {
    emailHash: string;
    hash: string;
    salt: string;
};

export interface UserUpdate {
    id: idOrEmailType;
    email?: string;
    emailHash?: string;
    salt?: string;
    hash?: string;
    verified?: boolean;
}

export interface UserCreation {
    email: string;
    emailHash: string;
    salt: string;
    hash: string;
}

type idOrEmailType = { id: number } | { email: string };

export class UserRepository {
    updateUser(user: UserUpdate) {
        return prisma.user.update({
            where: user.id,
            data: {
                email: user.email,
                verified: user.verified,
                secrets: {
                    update: {
                        salt: user.salt,
                        hash: user.hash,
                        emailHash: user.emailHash,
                    },
                },
            },
        });
    }

    createUser(user: UserCreation) {
        return prisma.user.create({
            data: {
                email: user.email,
                secrets: {
                    create: {
                        salt: user.salt,
                        hash: user.hash,
                        emailHash: user.emailHash,
                    },
                },
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

    fetchUser(idOrEmail: idOrEmailType, includeSecrets = false) {
        const userQuerySelect = {
            id: true,
            email: true,
            verified: true,
            createdAt: true,
            secrets: includeSecrets,
        };

        return prisma.user.findUnique({
            where: idOrEmail,
            select: userQuerySelect,
        });
    }
}
