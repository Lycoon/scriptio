import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function createProject(
  userId: number,
  title: string,
  description: string | undefined
) {
  const project = prisma.project
    .create({
      data: {
        title,
        description,
        user: {
          connect: { id: userId },
        },
      },
    })
    .catch(() => {
      return null;
    });

  return project;
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
