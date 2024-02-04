import { ScreenplayContextType } from "@src/context/ScreenplayContext";
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

const triggerCharactersUpdate = () => {
    const charactersUpdateEvent = new Event("onCharacterUpdate");
    window.dispatchEvent(charactersUpdateEvent);
};

export const upsertCharacterData = (data: CharacterData, screenplayCtx: ScreenplayContextType) => {
    screenplayCtx.charactersData[data.name] = data;
    triggerCharactersUpdate();
};

export const deleteCharacter = (name: string, screenplayCtx: ScreenplayContextType) => {
    delete screenplayCtx.charactersData[name];
    triggerCharactersUpdate();
};

export const doesCharacterExist = (name: string, screenplayCtx: ScreenplayContextType): boolean => {
    const nameUppered = name.toUpperCase();
    let found = false;

    Object.keys(screenplayCtx.charactersData).forEach((key) => {
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

export const computeFullCharactersData = async (
    scriptioScreenplay: any,
    persistentCharacters: CharacterMap,
    screenplayCtx: ScreenplayContextType
) => {
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

    screenplayCtx.updateCharactersData(charactersData);
    triggerCharactersUpdate();
};
