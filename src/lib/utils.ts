import { NextApiResponse } from "next";

export type ActiveButtons = {
  isScreenplay?: boolean;
  isStatistics?: boolean;
  isProjectEdition?: boolean;
};

export const onSuccess = (
  res: NextApiResponse,
  code: number,
  message: string,
  data: any
) => {
  res.status(code).json(onResponse("SUCCESS", message, data));
};

export const onError = (
  res: NextApiResponse,
  code: number,
  message: string
) => {
  res.status(code).json(onResponse("FAILED", message));
};

const onResponse = (status: string, message: string, data?: any) => {
  return {
    status,
    message,
    data,
  };
};
