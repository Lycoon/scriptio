import { ProjectContextType } from "@src/context/ProjectContext";
import { getNodeFlattenContent } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";
import { useState } from "react";
import { saveCharacters } from "../utils/requests";
import { JSONContent } from "@tiptap/react";

export enum CharacterGender {
    Female,
    Male,
    Other,
}
export type CharacterMap = { [name: string]: CharacterItem }; // map by character name
export type CharacterData = { name: string } & CharacterItem;
export type CharacterItem = {
    persistent: boolean;
    gender: CharacterGender;
    synopsis: string;
};

export const upsertCharacterData = (data: CharacterData, projectCtx: ProjectContextType) => {
    projectCtx.updateCharactersData((prevData: CharacterMap) => {
        const newData = { ...prevData, [data.name]: data };
        if (newData !== prevData) saveCharacters(projectCtx, newData);
        return newData;
    });
};

export const deleteCharacter = (name: string, projectCtx: ProjectContextType) => {
    projectCtx.updateCharactersData((prevData: CharacterMap) => {
        const newData = { ...prevData };
        delete newData[name];
        if (newData !== prevData) saveCharacters(projectCtx, newData);
        return newData;
    });
};

export const doesCharacterExist = (name: string, projectCtx: ProjectContextType): boolean => {
    const nameUppered = name.toUpperCase();
    let found = false;

    Object.keys(projectCtx.charactersData).forEach((key) => {
        if (key.toUpperCase() === nameUppered) {
            found = true;
            return;
        }
    });

    return found;
};

export const getCharacterNames = (screenplay: JSONContent) => {
    if (!screenplay.content) return [];

    const nodes = screenplay.content;
    const characters: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        const type: string = currNode.attrs!["class"];

        if (type !== ScreenplayElement.Character || !currNode.content) continue;

        const content: string = getNodeFlattenContent(currNode["content"]);
        if (!characters.includes(content)) {
            characters.push(content.toUpperCase());
        }
    }

    return characters;
};

export const computeFullCharactersData = async (
    screenplay: JSONContent,
    projectCtx: ProjectContextType
) => {
    let charactersData: CharacterMap = { ...projectCtx.project?.characters };
    console.log(charactersData);

    const namesFromEditor: string[] = getCharacterNames(screenplay);

    for (const name of namesFromEditor) {
        // If character already exists in the data, don't overwrite it
        if (charactersData[name] !== undefined) continue;

        charactersData[name] = {
            gender: CharacterGender.Other,
            synopsis: "",
            persistent: false,
        };
    }

    projectCtx.updateCharactersData(charactersData);
};

/* 
    NOTE: Character persistency

    Persistent characters are characters that are saved in the database.
    Characters can be made persistent if one is edited OR created from the navigation sidebar.
    All characters from the screenplay are non-persistent by default.
*/
export const getPersistentCharacters = (characters: CharacterMap): CharacterMap => {
    let persistentCharacters: CharacterMap = {};

    Object.keys(characters).forEach((key: string) => {
        const character = characters[key];
        if (character.persistent) persistentCharacters[key] = character;
    });

    return persistentCharacters;
};
