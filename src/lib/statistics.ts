import { useEffect } from "react";

interface IElementData {
    lineSize: number;
    lineY: number;
    offsetY: number;
}

type ActorData = { [name: string]: number };
type Distribution = { [key: number]: ActorData };

const ScreenplayElements: { [type: string]: IElementData } = {
    action: { lineSize: 67, lineY: 17, offsetY: 17 },
    scene: { lineSize: 69, lineY: 20, offsetY: 17 },
    dialogue: { lineSize: 41, lineY: 19, offsetY: 17 },
    parenthetical: { lineSize: 23, lineY: 19, offsetY: 0 },
    character: { lineSize: 44, lineY: 19, offsetY: 0 },
    transition: { lineSize: 67, lineY: 19, offsetY: 17 },
};

type ScreenplayData = {
    words: number;
    pageLimits: number[];
    distribution: Distribution;
};

export const getScreenplayData = (json: any): ScreenplayData => {
    const nodes = json.content!;
    const maxPageY: number = 1000;
    const pageLimits: number[] = []; // contains at which character page stops
    const distribution: Distribution = {};

    let currSizeY: number = 0;
    let characters: number = 0;
    let words: number = 0;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];
        if (!currNode["content"]) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const content = currNode["content"][0]["text"];
        const length = content.length;
        characters += length;
        words += content.split(" ").length;

        const elt = ScreenplayElements[type];
        if (!elt) continue;

        const sizeY = (length / elt.lineSize + 1) * elt.lineY + elt.offsetY;
        currSizeY += sizeY;

        if (currSizeY >= maxPageY) {
            pageLimits.push(characters); // marking page limit
            currSizeY %= maxPageY;
        }

        if (type === "character") {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeJ = nodes[j];
                const typeJ = nodeJ["attrs"]["class"];
                const contentJ = nodeJ["content"][0]["text"];

                if (typeJ === "parenthetical") continue;
                if (typeJ === "dialogue") {
                    if (!distribution[pageLimits.length])
                        distribution[pageLimits.length] = {};

                    const actors = distribution[pageLimits.length];
                    const prevCount = actors[content] ?? 0;
                    actors[content] = prevCount + contentJ.length;

                    continue;
                }

                break;
            }
        }
    }

    return { words, pageLimits, distribution };
};

export const getRandomColors = (
    occurrences: number,
    saturation: number,
    luminance: number
) => {
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
