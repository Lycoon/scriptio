import { UserRepository } from "../repository/user-repository";
import crypto from "crypto";

const repository = new UserRepository();

export async function deleteUser(email: string) {
  const user = await repository.deleteUser(email);
  return user;
}

export async function createUser(email: string, password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");

  const user = await repository.createUser(email, hash, salt);
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

export async function getUserSecrets(email: string) {
  const user = await repository.fetchUserSecrets(email);
  return user;
}
