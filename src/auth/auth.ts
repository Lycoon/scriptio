import Iron from "@hapi/iron";
import crypto from "crypto";

export async function createLoginSession(session: any, secret: any) {
  const createdAt = Date.now();
  const obj = { ...session, createdAt };
  const token = await Iron.seal(obj, secret, Iron.defaults);

  return token;
}

export async function getLoginSession(token: any, secret: any) {
  const session = await Iron.unseal(token, secret, Iron.defaults);
  const expiresAt = session.createdAt + session.maxAge * 1000;

  // Validate the expiration date of the session
  if (session.maxAge && Date.now() > expiresAt) {
    throw new Error("Session expired");
  }

  return session;
}

export function validatePassword(
  inputPassword: string,
  hash: string,
  salt: string
) {
  const inputHash = crypto
    .pbkdf2Sync(inputPassword, salt, 1000, 64, "sha512")
    .toString("hex");

  const matched = hash === inputHash;
  return matched;
}
