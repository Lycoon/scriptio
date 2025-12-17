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
    id: idOrEmailType;
    email?: string;
    verified?: boolean;
    secrets?: UpdateSecrets;
    settings?: UpdateSettings;
}

export interface UserCreation {
    email: string;
    secrets: SecretCreation;
}

export interface SecretCreation {
    password: string;
    emailHash: string;
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
}
