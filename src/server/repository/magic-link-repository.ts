import prisma from "../db";

export interface MagicLinkTokenCreation {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    desktopNonce: string | null;
    inviteToken: string | null;
}

export class MagicLinkRepository {
    deleteExpired() {
        return prisma.magicLinkToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }

    countRecent(email: string, windowStart: Date) {
        return prisma.magicLinkToken.count({
            where: {
                email,
                createdAt: { gte: windowStart },
            },
        });
    }

    create(data: MagicLinkTokenCreation) {
        return prisma.magicLinkToken.create({ data });
    }

    findByHash(tokenHash: string) {
        return prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    }

    deleteByHash(tokenHash: string) {
        return prisma.magicLinkToken.deleteMany({ where: { tokenHash } });
    }
}
