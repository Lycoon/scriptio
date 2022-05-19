import { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { sessionOptions } from "../../../src/lib/session";

export type User = {
  isLoggedIn: boolean;
  email: string;
  id: number;
};

export default withIronSessionApiRoute(userRoute, sessionOptions);

async function userRoute(
  req: NextApiRequest,
  res: NextApiResponse<Partial<User>>
) {
  console.log("GET api/users/");
  if (req.session.user) {
    console.log("req.session.user: ", req.session.user);
    // in a real world application you might read the user id from the session and then do a database request
    // to get more information on the user if needed
    res.json({
      ...req.session.user,
      isLoggedIn: true,
    });
  } else {
    res.json({
      isLoggedIn: false,
      email: "",
      id: -1,
    });
  }
}
