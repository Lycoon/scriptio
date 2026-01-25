import z from "zod";

export const LoginBodySchema = z.object({
    email: z.email(),
    password: z.string(),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SignupBodySchema = z.object({
    email: z.email(),
    password: z.string(),
    inviteToken: z.string().optional(),
});
export type SignupBody = z.infer<typeof SignupBodySchema>;

export const RequestRecoveryBodySchema = z.object({
    email: z.email(),
});
export type RequestRecoveryBody = z.infer<typeof RequestRecoveryBodySchema>;

export const RecoverPasswordBodySchema = z.object({
    userId: z.string(),
    password: z.string(),
    recoverHash: z.string(),
});
export type RecoverPasswordBody = z.infer<typeof RecoverPasswordBodySchema>;

export const CreateProjectBodySchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    poster: z.string().optional(),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const UpdateProjectBodySchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    poster: z.string().optional(),
    characters: z.any().optional(),
});
export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;

export const UpdateRoleSchema = z.object({
    role: z.string(),
});
export type UpdateRoleBody = z.infer<typeof UpdateRoleSchema>;

export const UpdatePasswordBodySchema = z.object({
    password: z.string(),
});
export type UpdatePasswordBody = z.infer<typeof UpdatePasswordBodySchema>;

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const UpdateUserBodySchema = z.object({
    username: z.string().optional(),
    color: z.string().regex(HEX_COLOR_REGEX).optional(),
});
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;
