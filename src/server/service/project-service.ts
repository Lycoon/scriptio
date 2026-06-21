import { ProjectRole } from "../../generated/client/client";
import { ProjectUpdate, ProjectCreation } from "../../lib/utils/types";
import { ProjectRepository } from "../repository/project-repository";

const repository = new ProjectRepository();

export async function create(project: ProjectCreation) {
    return repository.createProject(project);
}

export async function update(project: ProjectUpdate) {
    return repository.updateProject(project);
}

export async function destroy(projectId: string) {
    return repository.deleteProject(projectId);
}

export async function getProjectTitle(projectId: string) {
    return repository.fetchProjectTitle(projectId);
}

export async function getMembership(projectId: string, userId: string) {
    return repository.fetchProjectMembership(projectId, userId);
}

export async function getMemberships(userId: string) {
    return repository.fetchProjectMemberships(userId);
}

export async function getCollaborators(projectId: string) {
    return repository.fetchCollaborators(projectId);
}

export async function upsertMember(projectId: string, userId: string, role: ProjectRole = ProjectRole.VIEWER) {
    return repository.setProjectMember(projectId, userId, role);
}

export async function createInvite(projectId: string, email: string, token: string) {
    return repository.createInvite(projectId, email, token);
}

export async function getInvites(projectId: string) {
    return repository.fetchInvites(projectId);
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

export async function deleteProjectMember(projectId: string, userId: string) {
    return repository.deleteProjectMember(projectId, userId);
}

export async function countProjects() {
    return repository.countAll();
}

export async function countMembershipsByUser(userId: string) {
    return repository.countMembershipsByUser(userId);
}

export async function searchProjects(term: string, limit: number, cursor?: number) {
    return repository.searchProjects(term, limit, cursor);
}

export async function getProjectById(projectId: string) {
    return repository.fetchProjectById(projectId);
}

export async function getInvitesWithMeta(projectId: string) {
    return repository.fetchInvitesWithMeta(projectId);
}

// ── Cloud assets ───────────────────────────────────────────────────────────

export async function getProjectOwnerId(projectId: string) {
    return repository.fetchProjectOwnerId(projectId);
}

export async function getOwnerStorageUsed(ownerId: string) {
    return repository.sumOwnerAssetSize(ownerId);
}

export async function getProjectStorageUsed(projectId: string) {
    return repository.sumProjectAssetSize(projectId);
}

export async function getAsset(projectId: string, hash: string) {
    return repository.fetchAsset(projectId, hash);
}

export async function createAsset(asset: {
    projectId: string;
    hash: string;
    mime: string;
    size: number;
    width: number;
    height: number;
}) {
    return repository.createAsset(asset);
}

export async function listAssetHashes(projectId: string) {
    return repository.listAssetHashes(projectId);
}

export async function getExistingAssetHashes(projectId: string, hashes: string[]) {
    return repository.existingAssetHashes(projectId, hashes);
}

export async function getProjectAssets(projectId: string) {
    return repository.listAssets(projectId);
}

export async function deleteAssets(projectId: string, hashes: string[]) {
    return repository.deleteAssets(projectId, hashes);
}
