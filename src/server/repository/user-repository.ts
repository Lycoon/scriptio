import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function fetchUserFromId(userId: number) {
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

export function fetchUserFromEmail(email: string) {
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
