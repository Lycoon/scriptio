import { ProjectRole } from "@prisma/client";
import { ProjectUpdateDTO, ProjectCreation } from "../../lib/utils/types";
import { ProjectRepository } from "../repository/project-repository";

const repository = new ProjectRepository();

export async function create(project: ProjectCreation) {
    return repository.createProject(project);
}

export async function update(project: ProjectUpdateDTO) {
    return repository.updateProject(project);
}

export async function destroy(projectId: string) {
    return repository.deleteProject(projectId);
}

export async function getAll(userId: number) {
    return repository.fetchProjects(userId);
}

export async function get(projectId: string, includeMembers = false) {
    return repository.fetchProjectFromId(projectId, includeMembers);
}

export async function upsertMember(projectId: string, userId: number, role: ProjectRole = ProjectRole.VIEWER) {
    return repository.setProjectMember(projectId, userId, role);
}

export async function getMember(projectId: string, userId: number, includeProject = false) {
    return repository.fetchProjectMember(projectId, userId, includeProject);
}

export async function createInvite(projectId: string, email: string, token: string) {
    return repository.createInvite(projectId, email, token);
}
export async function getInvite(token: string) {
    return repository.fetchInvite(token);
}

export async function deleteInviteFromToken(token: string) {
    return repository.deleteInviteFromToken(token);
}

export async function deleteInviteFromEmail(email: string, projectId: string) {
    return repository.deleteInviteFromEmail(email, projectId);
}

export async function deleteProjectMember(projectId: string, userId: number) {
    return repository.deleteProjectMember(projectId, userId);
}
