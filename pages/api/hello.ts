import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  name: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    res.status(404).json({ name: "Error" });
    return;
  }

  const body = req.body;
  res.status(200).json({ name: "test" });
}
