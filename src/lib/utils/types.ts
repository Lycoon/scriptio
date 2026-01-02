import { DocumentType, NodeType, TextType } from "@tiptap/core";
import { UpdateSecrets, UpdateSettings } from "../../server/repository/user-repository";
import { CharacterMap } from "../editor/characters";

export type Screenplay = DocumentType<
    Record<string, any> | undefined,
    NodeType<string, undefined | Record<string, any>, any, (NodeType | TextType)[]>[]
>;

export type CookieUser = {
    id: string;
    email: string;
    createdAt: Date;
};

export type User = CookieUser & {
    settings: UpdateSettings;
    secrets?: UpdateSecrets;
};

export type ProjectCreation = {
    userId: string;
    title: string;
    description?: string;
    hasPoster?: boolean;
};

export type ProjectUpdate = {
    projectId: string;
    title?: string;
    description?: string;
    hasPoster?: boolean;
    characters?: CharacterMap;
};

export interface UserSettings {
    "keybinds": Record<string, string>,
    "theme": UserTheme,
    "language": "en"
}

export type UserTheme = "light" | "dark";
export interface UserThemeDefinition {
    name: UserTheme;
    style: string; // CSS class
}