import { DocumentType, JSONContent, NodeType, TextType } from "@tiptap/core";
import { UpdateSecrets, UpdateSettings } from "../../server/repository/user-repository";

export type Screenplay = JSONContent[];

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
    author?: string;
    hasPoster?: boolean;
};

export type ProjectUpdate = {
    projectId: string;
    title?: string;
    description?: string;
    author?: string;
    hasPoster?: boolean;
};

/* User Settings */
export interface UserSettings {
    keybinds: Record<string, string>;
    theme: UserTheme;
    language: UserLanguage;
    themedEditor: boolean;
}

export type UserLanguage = "en";
export type UserTheme = "light" | "dark" | "latte" | "wonka" | "mint" | "blossom";

export interface UserOnlineSettings {
    color: string;
    username: string;
}

export interface UserThemeDefinition {
    name: UserTheme;
    style: string; // CSS class
}

/* Comments */
export type CommentReply = {
    id: string;
    text: string;
    author: string;
    createdAt: number;
};

export type Comment = {
    id: string;
    text: string;
    author: string;
    createdAt: number;
    resolved: boolean;
    replies: CommentReply[];
};
