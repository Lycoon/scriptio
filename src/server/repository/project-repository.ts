import { ProjectCreationDTO, ProjectUpdateDTO } from "../../lib/utils/types";
import prisma from "../db";

export class ProjectRepository {
    updateProject(project: ProjectUpdateDTO) {
        return prisma.project.update({
            data: {
                title: project.title,
                description: project.description,
                screenplay: project.screenplay,
                titlePage: project.titlePage,
                poster: project.poster,
                characters: project.characters,
            },
            where: {
                id: project.projectId,
            },
        });
    }

    deleteProject(project: ProjectUpdateDTO) {
        return prisma.project.delete({
            where: {
                id: project.projectId,
            },
        });
    }

    createProject(project: ProjectCreationDTO) {
        return prisma.project.create({
            data: {
                title: project.title,
                description: project.description,
                poster: project.poster,
                screenplay: {},
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
                projects: {
                    select: {
                        // fetch everything but the screenplay
                        id: true,
                        title: true,
                        updatedAt: true,
                        createdAt: true,
                        poster: true,
                    },
                },
            },
        });
    }

    fetchProjectFromId(projectId: string) {
        return prisma.project.findUnique({
            where: {
                id: projectId,
            },
        });
    }
}
