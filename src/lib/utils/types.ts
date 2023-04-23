import { Prisma } from "@prisma/client";
import { Secrets, Settings } from "../../server/repository/user-repository";
import { CharacterMap } from "./characters";

export type CookieUser = {
    id: number;
    email: string;
    isLoggedIn: boolean;
    createdAt: Date;
};

export type User = {
    id: number;
    email: string;
    verified: boolean;
    createdAt: Date;
    settings: Settings;
    secrets?: Secrets;
};

export type Project = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    poster: string;
    description: string | null;
    screenplay: Prisma.JsonValue | null;
    characters: CharacterMap;
    userId: number;
};
