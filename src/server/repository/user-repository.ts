import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class UserRepository {
  createUser(email: string, password: string) {
    const created = prisma.user
      .create({
        data: {
          email,
          password,
        },
      })
      .catch(() => {
        return null;
      });

    return created;
  }

  deleteUser(email: string) {
    const deleted = prisma.user
      .delete({
        where: {
          email,
        },
      })
      .catch(() => {
        return null;
      });

    return deleted;
  }

  fetchUserFromId(userId: number) {
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

  fetchUserFromEmail(email: string) {
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
}
