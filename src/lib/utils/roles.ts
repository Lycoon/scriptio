import { ProjectRole } from "@prisma/client";

const ROLES: Record<ProjectRole, number> = {
    // Viewers can only view project
    VIEWER: 0,
    // Editors can edit the project
    EDITOR: 50,
    // Admins can invite and kick members from the project
    ADMIN: 75,
    // Owners can delete the project
    OWNER: 100,
};

export function hasRoleOrGreater(userRole: ProjectRole, requiredRole: ProjectRole) {
    const userLevel = ROLES[userRole] || 0;
    const requiredLevel = ROLES[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

export function isValid(role: any): boolean {
    if (typeof role === "string") return Object.keys(ROLES).includes(role);
    return false;
}
