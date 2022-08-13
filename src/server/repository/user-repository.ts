import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type Secrets = {
    hash?: string;
    salt?: string;
    emailHash?: string;
    lastEmailHash?: Date;
};

export type Settings = {
    highlightOnHover?: boolean;
    sceneBackground?: boolean;
};

export interface UserUpdate {
    id: idOrEmailType;
    email?: string;
    verified?: boolean;
    secrets?: Secrets;
    settings?: Settings;
}

export interface UserCreation {
    email: string;
    secrets: Secrets;
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
                    update: user.secrets,
                },
                settings: {
                    update: user.settings,
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
                        hash: user.secrets.hash!,
                        salt: user.secrets.salt!,
                        emailHash: user.secrets.emailHash!,
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
}
