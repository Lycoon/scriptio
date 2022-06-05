import { getObject } from "../../lib/images";
import {
  ProjectCreation,
  ProjectRepository,
  ProjectUpdate,
} from "../repository/project-repository";

const repository = new ProjectRepository();

export async function updateProject(project: ProjectUpdate) {
  return repository.updateProject(project);
}

export async function deleteProject(project: ProjectUpdate) {
  return repository.deleteProject(project);
}

export async function createProject(project: ProjectCreation) {
  return repository.createProject(project);
}

export async function getProjects(userId: number) {
  return repository.fetchProjects(userId);
}

export async function getProjectFromId(projectId: number) {
  return repository.fetchProjectFromId(projectId);
}
