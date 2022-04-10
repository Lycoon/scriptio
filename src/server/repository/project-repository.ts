import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface ProjectUpdate {
  projectId: number;
  title?: string;
  description?: string;
}

export interface ProjectCreation {
  userId: number;
  title: string;
  description?: string;
}

export class ProjectRepository {
  updateProject(project: ProjectUpdate) {
    const updated = prisma.project
      .update({
        data: {
          title: project.title,
          description: project.description,
          updatedAt: new Date().toISOString(),
        },
        where: {
          id: project.projectId,
        },
      })
      .catch(() => {
        return null;
      });

    return updated;
  }

  deleteProject(project: ProjectUpdate) {
    const deleted = prisma.project
      .delete({
        where: {
          id: project.projectId,
        },
      })
      .catch(() => {
        return null;
      });

    return deleted;
  }

  createProject(project: ProjectCreation) {
    const created = prisma.project
      .create({
        data: {
          title: project.title,
          description: project.description,
          user: {
            connect: { id: project.userId },
          },
        },
      })
      .catch(() => {
        return null;
      });

    return created;
  }

  fetchProjects(userId: number) {
    const projects = prisma.user
      .findUnique({
        where: {
          id: userId,
        },
        select: {
          projects: true,
        },
      })
      .catch(() => {
        return null;
      });

    return projects;
  }

  fetchProjectFromId(projectId: number) {
    const project = prisma.project
      .findUnique({
        where: {
          id: projectId,
        },
      })
      .catch(() => {
        return null;
      });

    return project;
  }
}
