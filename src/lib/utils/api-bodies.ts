import z from "zod";

export const RequestMagicLinkBodySchema = z.object({
    email: z.email(),
    desktopNonce: z.string().min(16).optional(),
    inviteToken: z.string().optional(),
});
export type RequestMagicLinkBody = z.infer<typeof RequestMagicLinkBodySchema>;

export const VerifyMagicLinkBodySchema = z.object({
    token: z.string().min(1),
});
export type VerifyMagicLinkBody = z.infer<typeof VerifyMagicLinkBodySchema>;

export const CreateProjectBodySchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    poster: z.string().optional(),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const UpdateProjectBodySchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    poster: z.string().optional(),
    characters: z.any().optional(),
});
export type UpdateProjectBody = z.infer<typeof UpdateProjectBodySchema>;

export const UpdateRoleSchema = z.object({
    role: z.string(),
});
export type UpdateRoleBody = z.infer<typeof UpdateRoleSchema>;

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const UpdateUserBodySchema = z.object({
    username: z.string().optional(),
    color: z.string().regex(HEX_COLOR_REGEX).optional(),
});
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;
