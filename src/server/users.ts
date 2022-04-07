import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ProjectUpdate {
  projectId: number;
  title?: string;
  description?: string;
}

interface ProjectCreation {
  userId: number;
  title: string;
  description?: string;
}

export function updateProject(project: ProjectUpdate) {
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

export function deleteProject(project: ProjectUpdate) {
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

export function createProject(project: ProjectCreation) {
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

export function getProjects(userId: number) {
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

export function getProjectFromId(projectId: number) {
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

export function getUserFromId(userId: number) {
  const user = prisma.user
    .findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
        createdAt: true,
      },
    })
    .catch(() => {
      return null;
    });

  return user;
}

export function getUserFromEmail(email: string) {
  const user = prisma.user
    .findUnique({
      where: {
        email,
      },
      select: {
        email: true,
        createdAt: true,
      },
    })
    .catch(() => {
      return null;
    });

  return user;
}
