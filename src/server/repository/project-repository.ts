import { ProjectCreation, ProjectUpdate } from "../../lib/utils/types";
import { Prisma, ProjectRole } from "@prisma/client";
import prisma from "../db";

import * as S3 from "@src/lib/s3";

const projectMembershipSelect = {
    project: {
        select: {
            id: true,
            title: true,
            hasPoster: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            characters: true,
        },
    },
    role: true,
};

const projectSelect = projectMembershipSelect.project.select;
type RawProject = Prisma.ProjectGetPayload<{
    select: typeof projectSelect;
}>;

export type Project = Omit<RawProject, "poster"> & {
    poster: string | null;
};
export interface ProjectMembershipPayload {
    role: ProjectRole;
    project: Project;
}

export class ProjectRepository {
    private async hydrateMembership(membership: any): Promise<ProjectMembershipPayload> {
        let posterUrl: string | null = null;

        if (membership.project.poster) {
            const key = `poster-${membership.project.id}`;
            posterUrl = await S3.getSignedDownloadUrl(key);
        }

        return {
            ...membership,
            project: {
                ...membership.project,
                poster: posterUrl,
            },
        };
    }

    async fetchProjectMemberships(userId: number) {
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

        return Promise.all(user.projects.map((m) => this.hydrateMembership(m)));
    }

    async fetchProjectMembership(projectId: string, userId: number) {
        const membership = await prisma.projectMember.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId,
                },
            },
            select: projectMembershipSelect,
        });

        if (!membership) return null;

        return this.hydrateMembership(membership);
    }

    createProject(project: ProjectCreation) {
        return prisma.project.create({
            data: {
                title: project.title,
                description: project.description,
                hasPoster: project.hasPoster,
                members: {
                    create: {
                        userId: project.userId,
                        role: ProjectRole.OWNER,
                    },
                },
            },
        });
    }

    updateProject(project: ProjectUpdate) {
        return prisma.project.update({
            where: { id: project.projectId },
            data: {
                title: project.title,
                description: project.description,
                hasPoster: project.hasPoster,
                characters: project.characters,
            },
        });
    }

    deleteProject(projectId: string) {
        return prisma.project.delete({
            where: { id: projectId },
        });
    }

    setProjectMember(projectId: string, userId: number, role: ProjectRole) {
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

    deleteProjectMember(projectId: string, userId: number) {
        return prisma.projectMember.delete({
            where: {
                userId_projectId: {
                    projectId,
                    userId,
                },
            },
        });
    }
}
