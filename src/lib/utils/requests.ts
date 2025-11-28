import { NextApiResponse } from "next";
import { Settings } from "../../server/repository/user-repository";
import { CharacterMap, getPersistentCharacters } from "../editor/characters";
import { CookieUser, DataResult, ProjectCreated, ProjectCreation, ProjectCreationDTO, ProjectUpdateDTO } from "./types";
import { SaveMode, SaveStatus } from "./enums";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { setDesktopValue } from "../store";
import { ProjectContextType } from "@src/context/ProjectContext";
import { JSONContent } from "@tiptap/react";

enum APIMethod {
    Get = "GET",
    Post = "POST",
    Patch = "PATCH",
    Delete = "DELETE",
}

const request = async (url: string, method: string, body?: Object) => {
    const json = JSON.stringify(body);
    return fetch(url, {
        headers: { "Content-Type": "application/json" },
        method,
        body: json,
    });
};

// ------------------------------ //
//          API RESPONSE          //
// ------------------------------ //

export const ResponseAPI = (res: NextApiResponse, code: number, message: string, data?: any) => {
    res.status(code).json({ message, data });
};

export const ErrorResponse = (message: string) => {
    return { message, isError: true };
};

export const SuccessResponse = (message: string, data: any) => {
    return { message, data, isError: false };
};

// ------------------------------ //
//            PROJECT             //
// ------------------------------ //

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
        resCloud = await request(`/api/projects`, APIMethod.Post, body);

        if (resCloud.ok) {
            const json = await resCloud.json();
            cloudProjectId = json.data.id;
        } else {
            return ErrorResponse("Project could not be created on cloud");
        }
    }

    let resLocal, fileProjectId;
    if (isDesktop && project.saveMode & SaveMode.Local) {
        fileProjectId = randomUUID();

        // Add project setting to local storage
        resLocal = await setDesktopValue(fileProjectId, { cloudProjectId, path: project.filePath }, "projects.cfg");

        if (resLocal.error) {
            return ErrorResponse("Project could not be added to local storage");
        }

        try {
            // Create project file on disk
            writeFileSync(project.filePath!, JSON.stringify(body));
        } catch (err) {
            return ErrorResponse("Project could not be created on disk");
        }

        if (project.saveMode & ~SaveMode.Cloud) {
            // If project has only been created locally, return fileProjectId
            return SuccessResponse("Project created successfully", { id: fileProjectId });
        }
    }

    // If file has been synced to cloud, return cloudProjectId
    return SuccessResponse("Project created successfully", { id: cloudProjectId });
};

export const deleteProject = (projectId: string) => {
    return request(`/api/projects?projectId=${projectId}`, APIMethod.Delete, undefined);
};

export const editProject = (body: ProjectUpdateDTO) => {
    return request(`/api/projects`, APIMethod.Patch, body);
};

export const saveCharacters = async (projectCtx: ProjectContextType, characters: CharacterMap): Promise<Response> => {
    const persistentCharacters = getPersistentCharacters(characters); // Get rid of non-persistent characters

    const projectId = projectCtx.project!.id;
    const res = await editProject({ projectId, characters: persistentCharacters });

    if (res.ok) projectCtx.updateSaveStatus(SaveStatus.Saved);
    else projectCtx.updateSaveStatus(SaveStatus.Error);

    return res;
};

export const saveScreenplay = async (projectCtx: ProjectContextType, screenplay: JSONContent): Promise<Response> => {
    const projectId = projectCtx.project!.id;
    const res = await editProject({ projectId, screenplay });

    if (res.ok) projectCtx.updateSaveStatus(SaveStatus.Saved);
    else projectCtx.updateSaveStatus(SaveStatus.Error);

    return res;
};

// ------------------------------ //
//               USER             //
// ------------------------------ //

export const changePassword = (password: string) => {
    return request(`/api/users/password`, APIMethod.Patch, { password });
};

export const editUserSettings = (body: Settings) => {
    return request(`/api/users/settings`, APIMethod.Patch, body);
};

// ------------------------------ //
//         AUTHENTICATION         //
// ------------------------------ //

export const signup = (email: string, password: string) => {
    return request(`/api/signup`, APIMethod.Post, { email, password });
};

export const login = (email: string, password: string) => {
    return request(`/api/login`, APIMethod.Post, { email, password });
};

export const validateRecover = (userId: number, recoverHash: string, password: string) => {
    return request(`/api/recover`, APIMethod.Patch, { userId, recoverHash, password });
};

export const sendRecover = (email: string) => {
    return request(`/api/recover`, APIMethod.Post, { email });
};
