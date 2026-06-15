import { JSONContent } from "@tiptap/core";
import { UserRole } from "../../generated/client/browser";
import { UpdateSettings } from "../../server/repository/user-repository";

export type Screenplay = JSONContent[];

export type CookieUser = {
    id: string;
    email: string;
    createdAt: Date;
    role: UserRole;
};

export type User = CookieUser & {
    settings: UpdateSettings;
};

export type ProjectCreation = {
    id?: string;
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
    highlightOnHover: boolean;
}

export type UserLanguage = "en" | "es" | "fr" | "zh" | "ko" | "ja" | "de" | "pl";
export type UserTheme = "light" | "dark" | "latte" | "wonka" | "mint" | "blossom" | "midnight";

/* Dictionaries */

/**
 * Language codes supported for spellcheck dictionaries.
 * A superset of UserLanguage — spellcheck can support more languages than the UI.
 */
export type DictionaryLanguage =
    | UserLanguage
    | "en-GB" | "it" | "pt" | "pt-PT" | "nl" | "ru" | "uk" | "sv" | "da";

/** A dictionary available for download. */
export interface DictionaryInfo {
    code: DictionaryLanguage;
    name: string;
}

/** Metadata for a locally installed dictionary. */
export interface InstalledDictionary {
    code: DictionaryLanguage;
    /** Combined size of .aff + .dic in bytes */
    size: number;
    installedAt: number;
}

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
    /** data-id of the screenplay node this comment is anchored to. */
    nodeId: string;
    text: string;
    author: string;
    createdAt: number;
    resolved: boolean;
    replies: CommentReply[];
};
