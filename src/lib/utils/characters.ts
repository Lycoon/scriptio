export let charactersData: CharacterMap = {};
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

export const upsertCharacterData = (name: string, data: CharacterItem) => {
    charactersData[name] = data;
    triggerCharactersUpdate();
};

export const deleteCharacter = (name: string) => {
    delete charactersData[name];
    triggerCharactersUpdate();
};

export const doesCharacterExist = (name: string): boolean => {
    const nameUppered = name.toUpperCase();
    let found = false;

    Object.keys(charactersData).forEach((key) => {
        if (key.toUpperCase() === nameUppered) {
            found = true;
            return;
        }
    });

    return found;
};

export const getCharacterNames = (json: any) => {
    if (!json) return [];

    const nodes = json.content;
    const characters: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        if (!currNode["content"]) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const content: string = currNode["content"][0]["text"];

        if (type === "character" && !characters.includes(content)) {
            characters.push(content.toUpperCase());
        }
    }

    return characters;
};

export const computeFullCharactersData = async (json: any, fetchedCharacters: CharacterMap) => {
    charactersData = fetchedCharacters ?? {};
    const namesFromEditor = getCharacterNames(json);

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
    triggerCharactersUpdate();
};
