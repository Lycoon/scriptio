import { ProjectContextType } from "@src/context/ProjectContext";
import { getNodeFlattenContent } from "./screenplay";
import { ScreenplayElement } from "../utils/enums";

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
    projectCtx.charactersData[data.name] = data;
};

export const deleteCharacter = (name: string, projectCtx: ProjectContextType) => {
    delete projectCtx.charactersData[name];
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

export const getCharacterNames = (scriptioScreenplay: any) => {
    if (!scriptioScreenplay) return [];

    const nodes = scriptioScreenplay.content;
    const characters: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        if (!currNode["content"]) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const content: string = getNodeFlattenContent(currNode["content"]);

        if (type === ScreenplayElement.Character && !characters.includes(content)) {
            characters.push(content.toUpperCase());
        }
    }

    return characters;
};

export const computeFullCharactersData = async (scriptioScreenplay: any, projectCtx: ProjectContextType) => {
    const persistentCharacters = projectCtx.charactersData;
    let charactersData: CharacterMap = persistentCharacters ?? {};
    const namesFromEditor: string[] = getCharacterNames(scriptioScreenplay);

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

    Object.keys(characters).forEach((key) => {
        const character = characters[key];
        if (character.persistent) persistentCharacters[key] = character;
    });

    return persistentCharacters;
};
