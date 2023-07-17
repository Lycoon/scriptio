import { ProjectUpdateDTO, ProjectCreationDTO } from "../../lib/utils/types";
import { ProjectRepository } from "../repository/project-repository";

const repository = new ProjectRepository();

export async function updateProject(project: ProjectUpdateDTO) {
    return repository.updateProject(project);
}

export async function deleteProject(project: ProjectUpdateDTO) {
    return repository.deleteProject(project);
}

export async function createProject(project: ProjectCreationDTO) {
    return repository.createProject(project);
}

export async function getProjects(userId: number) {
    return repository.fetchProjects(userId);
}

export async function getProjectFromId(projectId: string) {
    return repository.fetchProjectFromId(projectId);
}
