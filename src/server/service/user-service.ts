import { UserRepository } from "../repository/user-repository";

const repository = new UserRepository();

export async function deleteUser(email: string) {
  const user = await repository.deleteUser(email);
  return user;
}

export async function createUser(email: string, password: string) {
  const user = await repository.createUser(email, password);
  return user;
}

export async function getUserFromId(userId: number) {
  const user = await repository.fetchUserFromId(userId);
  return user;
}

export async function getUserFromEmail(email: string) {
  const user = await repository.fetchUserFromEmail(email);
  return user;
}
