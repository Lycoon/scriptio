import { NextApiRequest, NextApiResponse } from "@node_modules/next";
import { AppError } from "./api-utils";

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

export const apiHandler = (handler: Handler) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        try {
            await handler(req, res);
        } catch (err: any) {
            if (err instanceof AppError) {
                return res.status(err.statusCode).json({
                    status: "error",
                    message: err.message,
                });
            }
            return res.status(500).json({
                status: "error",
                message: "Something went wrong on our end.",
            });
        }
    };
};
