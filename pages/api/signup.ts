import { NextApiRequest, NextApiResponse } from "next";
import {
  EMAIL_ALREADY_REGISTERED,
  MISSING_BODY,
  PASSWORD_REQUIREMENTS,
} from "../../src/lib/messages";
import { onError, onSuccess } from "../../src/lib/utils";
import { createUser } from "../../src/server/service/user-service";

export default async function signup(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const email: string = req.body.email;
    const password: string = req.body.password;

    if (!email || !password) {
      return onError(res, 400, MISSING_BODY);
    }

    if (password.length < 8) {
      return onError(res, 400, PASSWORD_REQUIREMENTS);
    }

    const created = await createUser(email, password);
    if (created === null) {
      return onError(res, 500, EMAIL_ALREADY_REGISTERED);
    }

    onSuccess(res, 201, "", created);
  } catch (error: any) {
    res.status(500).end(error.message);
  }
}
