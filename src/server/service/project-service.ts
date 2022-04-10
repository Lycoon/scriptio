import {
  ProjectCreation,
  ProjectRepository,
  ProjectUpdate,
} from "../repository/project-repository";

const repository = new ProjectRepository();

export async function updateProject(project: ProjectUpdate) {
  const res = await repository.updateProject(project);
  return res;
}

export async function deleteProject(project: ProjectUpdate) {
  const res = await repository.deleteProject(project);
  return res;
}

export async function createProject(project: ProjectCreation) {
  const res = await repository.createProject(project);
  return res;
}

export async function fetchProjects(userId: number) {
  const res = await repository.fetchProjects(userId);
  return res;
}

export async function fetchProjectFromId(projectId: number) {
  const res = await repository.fetchProjectFromId(projectId);
  return res;
}
