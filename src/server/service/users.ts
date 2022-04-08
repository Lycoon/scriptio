import { fetchUserFromEmail, fetchUserFromId } from "../repository/users";

export async function getUserFromId(userId: number) {
  const user = await fetchUserFromId(userId);
  return user;
}

export async function getUserFromEmail(email: string) {
  const user = await fetchUserFromEmail(email);
  return user;
}