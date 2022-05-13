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

  fetchUser(idOrEmail: any) {
    const user = prisma.user
      .findUnique({
        where: idOrEmail,
        select: userQuerySelect,
      })
      .catch(() => {
        return null;
      });

    return user;
  }

  fetchSecrets(idOrEmail: any) {
    const secrets = prisma.user
      .findUnique({
        where: idOrEmail,
        select: {
          emailHash: true,
          hash: true,
          salt: true,
        },
      })
      .catch(() => {
        return null;
      });

    return secrets;
  }
}
