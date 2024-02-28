import { NextApiResponse } from "next";
import { Settings } from "../../server/repository/user-repository";
import { CharacterItem, CharacterMap, getPersistentCharacters } from "../editor/characters";
import { CookieUser, DataResult, ProjectCreated, ProjectCreation, ProjectCreationDTO, ProjectUpdateDTO } from "./types";
import { SaveMode } from "./enums";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { setDesktopValue } from "../store";

const request = async (url: string, method: string, body?: Object) => {
    const bodyStr = JSON.stringify(body);

    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body: bodyStr,
    });
};

// API response
export const ResponseAPI = (res: NextApiResponse, code: number, message: string, data?: any) => {
    res.status(code).json({ message, data });
};

export const onDataError = (message: string) => {
    return { message, isError: true };
};

export const onDataSuccess = (message: string, data: any) => {
    return { message, data, isError: false };
};

// Projects
export const createProject = async (
    project: ProjectCreation,
    isDesktop: boolean,
    user: CookieUser | undefined
): Promise<DataResult<ProjectCreated>> => {
    let body: ProjectCreationDTO = {
        title: project.title,
        description: project.description,
        poster: project.poster,
    };

    let resCloud, cloudProjectId;
    if (user && project.saveMode & SaveMode.Cloud) {
        resCloud = await request(`/api/projects`, "POST", body);

        if (resCloud.ok) {
            const json = await resCloud.json();
            cloudProjectId = json.data.id;
        } else {
            return onDataError("Project could not be created on cloud");
        }
    }

    let resLocal, fileProjectId;
    if (isDesktop && project.saveMode & SaveMode.Local) {
        fileProjectId = randomUUID();

        // Add project setting to local storage
        resLocal = await setDesktopValue(fileProjectId, { cloudProjectId, path: project.filePath }, "projects.cfg");

        if (resLocal.error) {
            return onDataError("Project could not be added to local storage");
        }

        try {
            // Create project file on disk
            writeFileSync(project.filePath!, JSON.stringify(body));
        } catch (err) {
            return onDataError("Project could not be created on disk");
        }

        if (project.saveMode & ~SaveMode.Cloud) {
            // If project has only been created locally, return fileProjectId
            return onDataSuccess("Project created successfully", { id: fileProjectId });
        }
    }

    // If file has been synced to cloud, return cloudProjectId
    return onDataSuccess("Project created successfully", { id: cloudProjectId });
};

export const deleteProject = (projectId: string) => {
    return request(`/api/projects?projectId=${projectId}`, "DELETE", undefined);
};

export const editProject = (body: ProjectUpdateDTO) => {
    return request(`/api/projects`, "PATCH", body);
};

// User
export const changePassword = (password: string) => {
    return request(`/api/users/password`, "PATCH", { password });
};

export const editUserSettings = (body: Settings) => {
    return request(`/api/users/settings`, "PATCH", body);
};

// Authentication
export const signup = (email: string, password: string) => {
    return request(`/api/signup`, "POST", { email, password });
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, "POST", { email, password });
};

export const validateRecover = (userId: number, recoverHash: string, password: string) => {
    return request(`/api/recover`, "PATCH", { userId, recoverHash, password });
};

export const sendRecover = (email: string) => {
    return request(`/api/recover`, "POST", { email });
};

// Screenplay
export const saveScreenplay = async (
    projectId: string,
    screenplay: any,
    characters: CharacterMap
): Promise<Response> => {
    const persistentCharacters = getPersistentCharacters(characters); // Get rid of non-persistent characters
    return editProject({ projectId, screenplay, characters: persistentCharacters });
};

export const saveProjectCharacters = async (projectId: string, characters: CharacterMap) => {
    editProject({
        projectId,
        characters,
    });
};
