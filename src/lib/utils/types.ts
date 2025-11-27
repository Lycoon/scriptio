import { Prisma } from "@prisma/client";
import { Secrets, Settings } from "../../server/repository/user-repository";
import { CharacterMap } from "../editor/characters";
import { JSONContent } from "@tiptap/react";
import { SaveMode } from "./enums";

// User
export type CookieUser = {
    id: number;
    email: string;
    createdAt: Date;
};

export type User = CookieUser & {
    settings: Settings;
    secrets?: Secrets;
};

// Project
export type Project = {
    id: string;
    userId: number;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    poster: string;
    description: string | null;
    screenplay: JSONContent;
    titlePage: JSONContent;
    characters: CharacterMap;
};

export type ProjectCreation = ProjectCreationDTO & {
    saveMode: SaveMode;
    filePath?: string;
};

// Used to return freshly created project id whether it's on the cloud or locally
// Callee should know whether it's on the cloud or locally
export type ProjectCreated = {
    id: string;
};

// Generic types
export type DesktopResponse<T> = {
    data: T | undefined;
    isLoading: boolean;
    error: any;
};

export type DataResult<T> = {
    data?: T;
    isError?: boolean;
    message?: string;
};

// Data Transfer Objects
export type ProjectCreationDTO = {
    title: string;
    userId?: number;
    description?: string;
    poster?: string;
};

export type ProjectUpdateDTO = {
    projectId: string;
    title?: string;
    description?: string;
    screenplay?: JSONContent;
    titlePage?: JSONContent;
    poster?: string;
    characters?: CharacterMap;
};
