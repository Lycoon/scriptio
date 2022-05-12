import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface UserUpdate {
  email?: string;
  emailHash?: string;
  salt?: string;
  hash?: string;
  active?: boolean;
}

export interface UserCreation {
  email: string;
  emailHash: string;
  salt: string;
  hash: string;
}

const userQuerySelect = {
  id: true,
  email: true,
  active: true,
  createdAt: true,
};

export class UserRepository {
  updateUser(user: UserUpdate) {
    const updated = prisma.user
      .update({
        data: {
          email: user.email,
          salt: user.salt,
          hash: user.hash,
          emailHash: user.emailHash,
          active: user.active,
        },
        where: {
          email: user.email,
        },
      })
      .catch(() => {
        return null;
      });

    return updated;
  }

  createUser(user: UserCreation) {
    const created = prisma.user
      .create({
        data: {
          email: user.email,
          salt: user.salt,
          hash: user.hash,
          emailHash: user.emailHash,
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
        select: userQuerySelect,
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
        select: userQuerySelect,
      })
      .catch(() => {
        return null;
      });

    return user;
  }

  fetchUserSecrets(email: string) {
    const user = prisma.user
      .findUnique({
        where: {
          email,
        },
        select: {
          hash: true,
          salt: true,
        },
      })
      .catch(() => {
        return null;
      });

    return user;
  }
}
