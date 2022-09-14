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

export const getNumberOfActors = (json: any): number => {
    let actors: string[] = [];
    const nodes = json.content!;

    for (let i = 0; i < nodes.length; i++) {
        const currNode = nodes[i];

        if (!currNode["content"] ) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const actor: string = currNode["content"][0]["text"];
        if (type != "character" || actors.includes(actor)) {
            continue;
        }

        actors.push(actor);
    }

    return actors.length;
}

export const getNumberOfWords = (json: any): number => {
    let numberOfWords = 0;

    const nodes = json.content!;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (!node["content"])
            continue;

        numberOfWords += node["content"][0]["text"].split(" ").length;
    }

    return numberOfWords;
};

export const getCharacterDistribution = (json: any, pages: number): any => {
    const frequency: { [key: string]: number } = {};
    const nodes = json.content!;
    const ratio = pages / nodes.length;

    let cursor: number = 0;

    for (let i = 0; i < nodes.length; i++) {
        if (i >= nodes.length - 1) {
            break;
        }

        const currNode = nodes[i];
        const nextNode = nodes[i + 1];

        if (!currNode["content"] || !nextNode["content"]) {
            continue;
        }

        cursor += currNode["content"][0]["text"].length;

        const type: string = currNode["attrs"]["class"];
        const nextType: string = nextNode["attrs"]["class"];
        if (type != "character" || nextType != "dialogue") {
            continue;
        }

        const currCharacter: string = currNode["content"][0]["text"];
        const dialog: string = nextNode["content"][0]["text"];
        const prevCount: number = frequency[currCharacter] ?? 0;

        frequency[currCharacter] = prevCount + dialog.length;
    }
}

/**
 * Returns character occurence for each character
 * @param json editor content JSON
 */
export const getCharacterFrequency = (json: any): { [key: string]: number } => {
    const frequency: { [key: string]: number } = {};
    const nodes = json.content!;

    for (let i = 0; i < nodes.length; i++) {
        if (i >= nodes.length - 1) {
            break;
        }

        const currNode = nodes[i];
        const nextNode = nodes[i + 1];

        if (!currNode["content"] || !nextNode["content"]) {
            continue;
        }

        const type: string = currNode["attrs"]["class"];
        const nextType: string = nextNode["attrs"]["class"];
        if (type != "character" || nextType != "dialogue") {
            continue;
        }

        const currCharacter: string = currNode["content"][0]["text"];
        const dialog: string = nextNode["content"][0]["text"];
        const prevCount: number = frequency[currCharacter] ?? 0;

        frequency[currCharacter] = prevCount + dialog.length;
    }

    let values: number[] = Object.values(frequency);
    const labels = Object.keys(frequency);
    const sum = values.reduce((acc, curr) => acc + curr, 0);

    values = values.map((e) => +((e / sum) * 100).toFixed(1));

    for (let i = 0; i < labels.length; i++) {
        frequency[labels[i]] = values[i];
    }

    Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]);
    var items = Object.keys(frequency).map((key: string) => {
        return [key, frequency[key]];
    });

    items.sort((first: any, second: any) => {
        return second[1] - first[1];
    });

    return { ...Object.fromEntries(items.slice(0, 6)) };
};
