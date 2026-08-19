import { ProjectCreation, ProjectUpdate } from "../../lib/utils/types";
import { Prisma, ProjectRole } from "../../generated/client/client";
import prisma from "../db";

import { ConflictError } from "@src/lib/utils/api-utils";

const projectMembershipSelect = {
    project: {
        select: {
            id: true,
            title: true,
            hasPoster: true,
            description: true,
            author: true,
            createdAt: true,
            updatedAt: true,
        },
    },
    role: true,
};

const collaboratorSelect = {
    user: {
        select: {
            id: true,
            email: true,
        },
    },
    role: true,
} satisfies Prisma.ProjectMemberSelect;

export type Collaborator = Prisma.ProjectMemberGetPayload<{
    select: typeof collaboratorSelect;
}>;

export type ProjectInvite = Prisma.ProjectInvitationGetPayload<{
    select: {
        email: true;
    };
}>;

type RawProject = Prisma.ProjectGetPayload<{
    select: typeof projectMembershipSelect.project.select;
}>;

/**
 * Project metadata as the client sees it. The poster image itself is *not* part
 * of this payload: it is fetched (and cached offline) through
 * `/projects/[projectId]/poster`, so `hasPoster` is only a hint that one exists.
 */
export type Project = RawProject;

export interface ProjectMembershipPayload {
    role: ProjectRole;
    project: Project;
}

export class ProjectRepository {
    async fetchProjectMemberships(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                projects: {
                    select: projectMembershipSelect,
                    orderBy: {
                        project: {
                            updatedAt: "desc",
                        },
                    },
                },
            },
        });

        if (!user) return [];

        return user.projects;
    }

    async fetchProjectMembership(projectId: string, userId: string) {
        const membership = await prisma.projectMember.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId,
                },
            },
            select: projectMembershipSelect,
        });

        return membership;
    }

    fetchProjectTitle(projectId: string) {
        return prisma.project.findUnique({
            where: { id: projectId },
            select: {
                title: true,
            },
        });
    }

    fetchCollaborators(projectId: string): Promise<Collaborator[]> {
        return prisma.projectMember.findMany({
            where: { projectId },
            select: collaboratorSelect,
        });
    }

    async createProject(project: ProjectCreation) {
        try {
            return await prisma.project.create({
                data: {
                    ...(project.id && { id: project.id }),
                    title: project.title,
                    description: project.description,
                    author: project.author,
                    hasPoster: project.hasPoster,
                    members: {
                        create: {
                            userId: project.userId,
                            role: ProjectRole.OWNER,
                        },
                    },
                },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
                throw new ConflictError("A project with this id already exists");
            }
            throw e;
        }
    }

    updateProject(project: ProjectUpdate) {
        return prisma.project.update({
            where: { id: project.projectId },
            data: {
                title: project.title,
                description: project.description,
                author: project.author,
                hasPoster: project.hasPoster,
            },
        });
    }

    deleteProject(projectId: string) {
        return prisma.project.delete({
            where: { id: projectId },
        });
    }

    setProjectMember(projectId: string, userId: string, role: ProjectRole) {
        return prisma.projectMember.upsert({
            where: {
                userId_projectId: {
                    projectId,
                    userId,
                },
            },
            update: {
                role,
            },
            create: {
                projectId,
                userId,
                role,
            },
        });
    }

    fetchInvites(projectId: string) {
        return prisma.projectInvitation.findMany({
            where: { projectId },
            select: {
                email: true,
            },
        });
    }

    fetchInvite(token: string) {
        return prisma.projectInvitation.findUnique({
            where: { token },
        });
    }

    createInvite(projectId: string, email: string, token: string) {
        return prisma.projectInvitation.create({
            data: {
                projectId,
                email,
                token,
            },
        });
    }

    deleteInviteFromToken(token: string) {
        return prisma.projectInvitation.delete({
            where: { token },
        });
    }

    deleteInviteFromEmail(email: string, projectId: string) {
        return prisma.projectInvitation.delete({
            where: {
                email_projectId: {
                    email,
                    projectId,
                },
            },
        });
    }

    /** Hands the OWNER role to another member and demotes the current owner in
     *  one transaction — a half-applied swap would leave the project with two
     *  owners (or none), and the owner is the quota holder for every asset. */
    transferOwnership(projectId: string, currentOwnerId: string, newOwnerId: string, previousOwnerRole: ProjectRole) {
        return prisma.$transaction([
            prisma.projectMember.update({
                where: { userId_projectId: { projectId, userId: currentOwnerId } },
                data: { role: previousOwnerRole },
            }),
            prisma.projectMember.update({
                where: { userId_projectId: { projectId, userId: newOwnerId } },
                data: { role: ProjectRole.OWNER },
            }),
        ]);
    }

    deleteProjectMember(projectId: string, userId: string) {
        return prisma.projectMember.delete({
            where: {
                userId_projectId: {
                    projectId,
                    userId,
                },
            },
        });
    }

    countAll() {
        return prisma.project.count();
    }

    countMembershipsByUser(userId: string) {
        return prisma.projectMember.count({ where: { userId } });
    }

    /** Every membership of a user, with just what account deletion needs to
     *  tear each project down (no poster signing — unlike fetchProjectMemberships). */
    listMembershipsForTeardown(userId: string) {
        return prisma.projectMember.findMany({
            where: { userId },
            select: { role: true, projectId: true },
        });
    }

    /** Pending invitations addressed to an email, across every project. */
    deleteInvitesByEmail(email: string) {
        return prisma.projectInvitation.deleteMany({ where: { email } });
    }

    /** Memberships with raw project metadata — GDPR export (unlike
     *  fetchProjectMemberships, no poster URL signing or hydration). */
    listMembershipsWithProject(userId: string) {
        return prisma.projectMember.findMany({
            where: { userId },
            select: {
                role: true,
                project: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        author: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
            orderBy: { project: { createdAt: "asc" } },
        });
    }

    fetchProjectById(projectId: string) {
        return prisma.project.findUnique({
            where: { id: projectId },
            select: {
                id: true,
                title: true,
                author: true,
                description: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { members: true, invitations: true } },
            },
        });
    }

    fetchInvitesWithMeta(projectId: string) {
        return prisma.projectInvitation.findMany({
            where: { projectId },
            select: { email: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });
    }

    // ── Cloud assets (board images / audio) ────────────────────────────────

    /** The user id of the project's OWNER (the quota holder), or null. */
    async fetchProjectOwnerId(projectId: string): Promise<string | null> {
        const owner = await prisma.projectMember.findFirst({
            where: { projectId, role: ProjectRole.OWNER },
            select: { userId: true },
        });
        return owner?.userId ?? null;
    }

    /** Total bytes stored across every project owned by `ownerId`. */
    async sumOwnerAssetSize(ownerId: string): Promise<number> {
        const agg = await prisma.projectAsset.aggregate({
            _sum: { size: true },
            where: { project: { members: { some: { userId: ownerId, role: ProjectRole.OWNER } } } },
        });
        return agg._sum.size ?? 0;
    }

    /** Total bytes stored for a single project. */
    async sumProjectAssetSize(projectId: string): Promise<number> {
        const agg = await prisma.projectAsset.aggregate({
            _sum: { size: true },
            where: { projectId },
        });
        return agg._sum.size ?? 0;
    }

    fetchAsset(projectId: string, hash: string) {
        return prisma.projectAsset.findUnique({
            where: { projectId_hash: { projectId, hash } },
        });
    }

    createAsset(asset: { projectId: string; hash: string; mime: string; size: number; width: number; height: number }) {
        return prisma.projectAsset.create({ data: asset });
    }

    listAssetHashes(projectId: string) {
        return prisma.projectAsset.findMany({
            where: { projectId },
            select: { hash: true, createdAt: true },
        });
    }

    listAssets(projectId: string) {
        return prisma.projectAsset.findMany({
            where: { projectId },
            select: { hash: true, mime: true, size: true, width: true, height: true },
        });
    }

    async existingAssetHashes(projectId: string, hashes: string[]): Promise<string[]> {
        if (hashes.length === 0) return [];
        const rows = await prisma.projectAsset.findMany({
            where: { projectId, hash: { in: hashes } },
            select: { hash: true },
        });
        return rows.map((r) => r.hash);
    }

    deleteAssets(projectId: string, hashes: string[]) {
        return prisma.projectAsset.deleteMany({
            where: { projectId, hash: { in: hashes } },
        });
    }

    async searchProjects(term: string, limit: number, cursor?: number) {
        if (term) {
            const isUuid = /^[0-9a-f-]{36,}$/i.test(term);

            if (isUuid) {
                const project = await prisma.project.findUnique({
                    where: { id: term },
                    select: {
                        id: true,
                        title: true,
                        author: true,
                        createdAt: true,
                        updatedAt: true,
                        _count: { select: { members: true } },
                    },
                });
                return project ? [project] : [];
            }
        }

        return prisma.project.findMany({
            ...(term && { where: { title: { contains: term, mode: "insensitive" } } }),
            select: {
                id: true,
                title: true,
                author: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { members: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            skip: cursor ?? 0,
        });
    }
}
