import { UserRepository, UserUpdate } from "../repository/user-repository";
import crypto from "crypto";

const repository = new UserRepository();

export async function checkPassword(email: string, password: string) {
  const secrets = await getSecretsFromEmail(email);
  if (!secrets) {
    return false;
  }

  const hash = crypto
    .pbkdf2Sync(password, secrets.salt, 1000, 64, "sha512")
    .toString("hex");

  if (hash !== secrets.hash) {
    return false;
  }
  return true;
}

export async function createUser(email: string, password: string) {
  const emailHash = crypto.randomBytes(64).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");

  const created = await repository.createUser({
    email,
    emailHash,
    hash,
    salt,
  });

  return created;
}

export async function updateUser(user: UserUpdate) {
  const updated = await repository.updateUser(user);
  return updated;
}

export async function deleteUser(email: string) {
  const user = await repository.deleteUser(email);
  return user;
}

export async function getUserFromId(userId: number) {
  const user = await repository.fetchUser({ id: userId });
  return user;
}

export async function getUserFromEmail(email: string) {
  const user = await repository.fetchUser({ email });
  return user;
}

export async function getSecretsFromEmail(email: string) {
  const secrets = await repository.fetchSecrets({ email: email });
  return secrets;
}

export async function getSecretsFromId(id: number) {
  const secrets = await repository.fetchSecrets({ id: id });
  return secrets;
}
