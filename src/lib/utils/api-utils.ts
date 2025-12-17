import { NextApiResponse } from "@node_modules/next";
import z from "zod";

export interface ApiResponse<T = any> {
    status: "success" | "error";
    message?: string;
    data?: T;
}

export class AppError extends Error {
    constructor(public statusCode: number, public message: string) {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Not found") {
        super(404, message);
    }
}

export class ProjectNotFoundError extends NotFoundError {
    constructor() {
        super("Project not found");
    }
}

export class UserNotFoundError extends NotFoundError {
    constructor() {
        super("User not found");
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Access denied") {
        super(403, message);
    }
}

export class BodyFieldError extends AppError {
    constructor(message = "One or more body fields are missing and/or invalid") {
        super(422, message);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Authentication required") {
        super(401, message);
    }
}

export class MissingBodyError extends AppError {
    constructor(message = "Missing body") {
        super(400, message);
    }
}

export class InternalServerError extends AppError {
    constructor(message = "Internal server error") {
        super(500, message);
    }
}

export const SuccessNoContent = (res: NextApiResponse) => {
    res.status(204).end();
};

export const Success = <T>(res: NextApiResponse<ApiResponse<T>>, data: T, message?: string) => {
    res.status(200).json({ status: "success", data, ...(message && { message }) });
};

export const SuccessCreated = <T>(res: NextApiResponse<ApiResponse<T>>, data: T, message?: string) => {
    res.status(201).json({ status: "success", data, ...(message && { message }) });
};

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);

    if (!result.success) {
        const errorMessage = result.error.issues.map((i) => i.message).join(", ");
        throw new BodyFieldError(errorMessage);
    }

    return result.data;
}
