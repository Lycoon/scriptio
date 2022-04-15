import Local from "passport-local";
import crypto from "crypto";
import { getUserSecrets } from "../server/service/user-service";

function validatePassword(inputPassword: string, hash: string, salt: string) {
  const inputHash = crypto
    .pbkdf2Sync(inputPassword, salt, 1000, 64, "sha512")
    .toString("hex");
  const matched = hash === inputHash;
  return matched;
}

export const localStrategy = new Local.Strategy(async function (
  email,
  password,
  done
) {
  console.log("LOCAL STRATEGY");
  const found = await getUserSecrets(email);
  if (found === null) {
    done(new Error("Invalid email and password combination"));
  }

  if (found && validatePassword(password, found.password, found.salt)) {
    done(null, { status: "LOGGED" });
  } else {
    done(new Error("Invalid email and password combination"));
  }
});
