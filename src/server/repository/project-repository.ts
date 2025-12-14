import { ProjectCreation, ProjectUpdateDTO } from "../../lib/utils/types";
import { ProjectRole } from "@prisma/client";
import prisma from "../db";

export class ProjectRepository {
    createProject(project: ProjectCreation) {
        return prisma.project.create({
            data: {
                title: project.title,
                description: project.description,
                poster: project.poster === undefined,
                members: {
                    create: {
                        userId: project.userId,
                        role: ProjectRole.OWNER,
                    },
                },
            },
        });
    }

    updateProject(project: ProjectUpdateDTO) {
        return prisma.project.update({
            where: { id: project.projectId },
            data: {
                title: project.title,
                description: project.description,
                poster: project.poster,
                characters: project.characters,
            },
        });
    }

    deleteProject(projectId: string) {
        return prisma.project.delete({
            where: { id: projectId },
        });
    }

    fetchProjects(userId: number) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: {
                projects: { select: { project: true } },
            },
        });
    }

    fetchProjectFromId(projectId: string, includeMembers: boolean) {
        return prisma.project.findUnique({
            where: { id: projectId },
            include: {
                members: includeMembers,
            },
        });
    }

    setProjectMember(projectId: string, userId: number, role: ProjectRole) {
        return prisma.projectMember.upsert({
            where: {
                userId_projectId: {
                    projectId: projectId,
                    userId: userId,
                },
            },
            update: {
                role: role,
            },
            create: {
                projectId: projectId,
                userId: userId,
                role: role,
            },
        });
    }

    fetchProjectMember(projectId: string, userId: number, includeProject: boolean) {
        return prisma.projectMember.findUnique({
            where: {
                userId_projectId: {
                    userId: userId,
                    projectId: projectId,
                },
            },
            include: {
                project: includeProject,
            },
        });
    }

    createInvite(projectId: string, email: string, token: string) {
        const date = new Date();
        date.setDate(date.getDate() + 7);

        return prisma.projectInvitation.create({
            data: {
                projectId: projectId,
                email: email,
                token: token,
                createdAt: date,
            },
        });
    }

    fetchInvite(token: string) {
        return prisma.projectInvitation.findUnique({
            where: { token: token },
        });
    }

    deleteInviteFromToken(token: string) {
        return prisma.projectInvitation.delete({
            where: { token: token },
        });
    }

    deleteInviteFromEmail(email: string, projectId: string) {
        return prisma.projectInvitation.delete({
            where: {
                email_projectId: {
                    email: email,
                    projectId: projectId,
                },
            },
        });
    }

    deleteProjectMember(projectId: string, userId: number) {
        return prisma.projectMember.delete({
            where: {
                userId_projectId: {
                    projectId: projectId,
                    userId: userId,
                },
            },
        });
    }
}
