export type ScenesData = SceneItem[];
export type SceneItem = {
    title: string;
    position: number;
    nextPosition: number;
};

export enum CharacterGender {
    Female,
    Male,
    Other,
}
export type CharactersData = CharacterItem[];
export type CharacterItem = {
    name: string;
    gender: CharacterGender;
};

let scenesData: ScenesData = [];
export const getScenesData = (): ScenesData => {
    return scenesData;
};

export const computeFullScenesData = async (json: any) => {
    const nodes = json.content!;
    const scenes: ScenesData = [];
    let cursor = 1;
    let sceneNumber = 0;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        if (!currNode["content"]) {
            cursor += 2; // empty screenplay element count for new line
            continue;
        }

        let text = "";
        const type: string = currNode["attrs"]["class"];
        const content: any[] = currNode["content"];
        for (let j = 0; j < content.length; j++) {
            text += content[j]["text"];
        }

        if (type === "scene") {
            if (sceneNumber !== 0) {
                // first scene has no previous scene to set nextPosition
                scenes[scenes.length - 1].nextPosition = cursor;
            }

            scenes.push({
                position: cursor,
                nextPosition: -1,
                title: text.toUpperCase(),
            });

            sceneNumber++;
        }

        cursor += text.length + 2; // new line counts for 2 characters
    }

    scenesData = scenes;
};

export const updateScenesData = (transaction: any) => {
    const maps = transaction.mapping.maps;
    for (let i = 0; i < maps.length; i++) {
        const ranges = maps[i].ranges;
        for (let j = 0; j < ranges.length; j += 3) {
            const cursor = ranges[j];
            const oldSize = ranges[j + 1];
            const newSize = ranges[j + 2];
            const diff = newSize - oldSize;

            for (let k = 0; k < scenesData.length; k++) {
                if (scenesData[k].position < cursor) {
                    continue; // scene is before the change, no need to update
                }
                scenesData[k].position += diff;
            }
        }
    }
};
