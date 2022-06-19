import { PrismaClient, Project } from "@prisma/client";
import { JSONContent } from "@tiptap/react";

const prisma = new PrismaClient();

export interface ProjectUpdate {
    projectId: number;
    title?: string;
    description?: string;
    screenplay?: JSONContent;
    poster?: string;
}

export interface ProjectCreation {
    userId: number;
    title: string;
    description?: string;
    poster?: string;
}

export class ProjectRepository {
    updateProject(project: ProjectUpdate) {
        return prisma.project.update({
            data: {
                title: project.title,
                description: project.description,
                screenplay: project.screenplay,
                poster: project.poster,
            },
            where: {
                id: project.projectId,
            },
        });
    }

    deleteProject(project: ProjectUpdate) {
        return prisma.project.delete({
            where: {
                id: project.projectId,
            },
        });
    }

    createProject(project: ProjectCreation) {
        return prisma.project.create({
            data: {
                title: project.title,
                description: project.description,
                poster: project.poster,
                user: {
                    connect: { id: project.userId },
                },
            },
        });
    }

    fetchProjects(userId: number) {
        return prisma.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                projects: true,
            },
        });
    }

    fetchProjectFromId(projectId: number) {
        return prisma.project.findUnique({
            where: {
                id: projectId,
            },
        });
    }
}
