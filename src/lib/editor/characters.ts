import { ProjectContextType } from "@src/context/ProjectContext";
import { getNodeFlattenContent } from "./screenplay";

export enum CharacterGender {
    Female,
    Male,
    Other,
}
export type CharacterMap = { [name: string]: CharacterItem }; // map by character name
export type CharacterData = { name: string } & CharacterItem;
export type CharacterItem = {
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

        if (type === "character" && !characters.includes(content)) {
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
        if (charactersData[name] !== undefined) {
            // If character already exists in the data, don't overwrite it
            continue;
        }
        charactersData[name] = {
            gender: CharacterGender.Other,
            synopsis: "",
        };
    }

    projectCtx.updateCharactersData(charactersData);
};
