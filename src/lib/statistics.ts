import { useEffect } from "react";

interface IElementData {
    lineSize: number;
    lineY: number;
    offsetY: number;
}

export type ActorData = { [name: string]: number };
export type Distribution = { [page: number]: ActorData };
export type DialogueLengths = { [actor: string]: number[] };
export type Frequency = { [actor: string]: number };
export type Quantity = { [actor: string]: number };
export type StatsRatio = { [actor: string]: number };

type ScreenplayData = {
    words: number;
    pageLimits: number[];
    actors: number;
    distribution: Distribution;
    frequency: Frequency;
    quantity: Quantity;
    sceneRatio: StatsRatio;
    actionRatio: StatsRatio;
};

const ScreenplayElements: { [type: string]: IElementData } = {
    action: { lineSize: 67, lineY: 17, offsetY: 17 },
    scene: { lineSize: 69, lineY: 20, offsetY: 17 },
    dialogue: { lineSize: 41, lineY: 19, offsetY: 17 },
    parenthetical: { lineSize: 23, lineY: 19, offsetY: 0 },
    character: { lineSize: 44, lineY: 19, offsetY: 0 },
    transition: { lineSize: 67, lineY: 19, offsetY: 17 },
    section: { lineSize: 69, lineY: 20, offsetY: 17 },
};

const average = (list: number[]) => list.reduce((prev, curr) => prev + curr, 0) / list.length;

const cleanFrequency = (frequency: any) => {
    let items = Object.keys(frequency).map((key) => {
        return [key, frequency[key]];
    });

    items.sort((first, second) => {
        return second[1] - first[1];
    });

    // Computing other characters
    let others = items.splice(8);
    let freqOthers = 0;
    for (const e in others) {
        freqOthers += others[e][1];
    }
    items.push(["Others", freqOthers]);

    // Converting to percentage
    const sum = items.reduce((acc: number, curr) => acc + curr[1], 0);
    items.forEach((e) => {
        e[1] = Math.round((e[1] / sum) * 100);
    });

    // Converting array to dictionary
    let sorted: any = {};
    items.forEach((e: any) => {
        let key = e[0];
        let value = e[1];
        sorted[key] = value;
    });

    return sorted;
};

const getQuantity = (dialLengths: DialogueLengths) => {
    let quantity: Quantity = {};
    for (const actor in dialLengths) {
        quantity[actor] = average(dialLengths[actor]);
    }

    let items = Object.keys(quantity).map((key: string) => {
        return [key, quantity[key]];
    });

    items.sort((first: any, second: any) => {
        return second[1] - first[1];
    });

    items.splice(8);

    // Converting array to dictionary
    let sorted: any = {};
    items.forEach((e: any) => {
        let key = e[0];
        let value = e[1];
        sorted[key] = value;
    });

    return sorted;
};

const getFrequency = (distribution: Distribution) => {
    let frequency: Frequency = {};

    for (const page in distribution) {
        const actors = distribution[page];
        for (const actor in actors) {
            frequency[actor] = (frequency[actor] ?? 0) + actors[actor];
        }
    }

    return frequency;
};

export const getScreenplayData = (json: any): ScreenplayData => {
    const nodes = json.content!;
    const maxPageY: number = 990;
    const pageLimits: number[] = []; // contains at which character page stops
    const distribution: Distribution = {};
    const dialLengths: DialogueLengths = {};
    const sceneRatio: StatsRatio = { INT: 0, EXT: 0 };
    const actionRatio: StatsRatio = { Action: 0, Dialogue: 0 };

    let currSizeY: number = 0;
    let characters: number = 0;
    let words: number = 0;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        if (!currNode["content"]) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const content: string = currNode["content"][0]["text"];
        const length = content.length;
        characters += length;
        words += content.split(" ").length;

        const elt = ScreenplayElements[type];
        if (!elt) continue;

        // compute element size on a page
        const sizeY = (length / elt.lineSize + 1) * elt.lineY + elt.offsetY;
        currSizeY += sizeY;

        if (currSizeY >= maxPageY) {
            pageLimits.push(characters); // marking page limit
            currSizeY %= maxPageY;
        }

        // Actor distribution
        if (type === "character") {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeJ = nodes[j];
                if (!nodeJ["content"]) continue;

                const typeJ = nodeJ["attrs"]["class"];
                const contentJ = nodeJ["content"][0]["text"];

                if (typeJ === "parenthetical") continue;
                if (typeJ === "dialogue") {
                    if (!distribution[pageLimits.length]) distribution[pageLimits.length] = {};

                    const actors = distribution[pageLimits.length];
                    const prevCount = actors[content] ?? 0;
                    actors[content] = prevCount + contentJ.length;

                    if (!dialLengths[content]) dialLengths[content] = [];
                    dialLengths[content].push(contentJ.length);
                    actionRatio["Dialogue"] += contentJ.length;

                    continue;
                }
                break;
            }
        } else if (type === "scene") {
            if (content.startsWith("INT")) sceneRatio["INT"] += 1;
            else if (content.startsWith("EXT")) sceneRatio["EXT"] += 1;
        } else if (type === "action") {
            actionRatio["Action"] += content.length;
        }
    }

    // Frequency
    let frequency = getFrequency(distribution);
    const actors = Object.keys(frequency).length; // need to be done before cleaning
    frequency = cleanFrequency(frequency);

    // Quantity
    const quantity: Quantity = getQuantity(dialLengths);

    return {
        words,
        pageLimits,
        actors,
        distribution,
        frequency,
        quantity,
        sceneRatio,
        actionRatio,
    };
};

export const getScaledDistribution = (distribution: Distribution) => {
    const pages = Object.keys(distribution).length;

    const sample = 12;
    const step = +(pages / sample);
    let snapped = 0;

    const scaled: { [actor: string]: { [page: number]: number } } = {};

    for (const page in distribution) {
        if (+page > snapped) {
            if (snapped + step > pages) snapped = pages;
            else snapped += step;
        }

        for (const actor in distribution[page]) {
            if (!scaled[actor]) {
                scaled[actor] = {};
            }

            const snappedFixed = +snapped.toFixed();
            const prev = scaled[actor][snappedFixed];
            scaled[actor][snappedFixed] = (prev ?? 0) + distribution[page][actor];
        }
    }

    return scaled;
};

export const getRandomColors = (occurrences: number, saturation: number, luminance: number) => {
    const colors: string[] = [];
    const step = 1 / occurrences;
    const startHue = Math.random();

    for (let i = 0; i < occurrences; i++) {
        const RGB = HSLtoRGB((startHue + step * i) % 1, saturation, luminance);
        colors.push(`rgb(${RGB[0]}, ${RGB[1]}, ${RGB[2]})`);
    }

    return colors;
};

// https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
export const HSLtoRGB = (h: number, s: number, l: number) => {
    let r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};
