import {
  ProjectCreation,
  ProjectRepository,
  ProjectUpdate,
} from "../repository/project-repository";

const repository = new ProjectRepository();

export function updateProject(project: ProjectUpdate) {
  return repository.updateProject(project);
}

export function deleteProject(project: ProjectUpdate) {
  return repository.deleteProject(project);
}

export function createProject(project: ProjectCreation) {
  return repository.createProject(project);
}

export function getProjects(userId: number) {
  return repository.fetchProjects(userId);
}

export function getProjectFromId(projectId: number) {
  return repository.fetchProjectFromId(projectId);
}
