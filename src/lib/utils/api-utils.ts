import { NextResponse } from "next/server";
import z from "zod";

export interface ApiResponse<T = unknown> {
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
export class PaymentRequiredError extends AppError {
    constructor(message = "Pro subscription required") {
        super(402, message);
    }
}
export class MissingBodyError extends AppError {
    constructor(message = "Missing body") {
        super(400, message);
    }
}
export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super(409, message);
    }
}
export class InternalServerError extends AppError {
    constructor(message = "Internal server error") {
        super(500, message);
    }
}
export class StorageQuotaExceededError extends AppError {
    constructor(message = "Storage limit reached") {
        super(507, message);
    }
}

export const SuccessNoContent = () => {
    return new NextResponse(null, { status: 204 });
};

export const Success = <T>(data: T, message?: string) => {
    return NextResponse.json({ status: "success", data, ...(message && { message }) }, { status: 200 });
};

export const SuccessCreated = <T>(data: T, message?: string) => {
    return NextResponse.json({ status: "success", data, ...(message && { message }) }, { status: 201 });
};

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);

    if (!result.success) {
        const errorMessage = result.error.issues.map((i) => i.message).join(", ");
        throw new BodyFieldError(errorMessage);
    }

    return result.data;
}

/**
 * Converts a WebSocket URL (ws:// or wss://) to an HTTP URL (http:// or https://).
 * Useful for calling REST endpoints on the collaboration Worker from the Next.js server.
 */
export function getCollabHttpUrl(path: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_CLOUD_URL || "";
    return `${baseUrl}${path}`;
}
