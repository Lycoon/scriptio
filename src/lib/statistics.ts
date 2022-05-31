export const getRandomColors = (
  occurrences: number,
  hue: number,
  saturation: number
) => {
  const colors: string[] = [];
  const rangeStart = 0.5;
  const rangeEnd = 0.9;

  const step = (rangeEnd - rangeStart) / occurrences;

  for (let i = 0; i < occurrences; i++) {
    const RGB = HSLtoRGB(hue, saturation, rangeStart + i * step);
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

/**
 * Returns character occurence for each character
 * @param json editor content JSON
 */
export const getCharacterFrequency = (json: any): Map<string, number> => {
  const frequency = new Map<string, number>();
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
    const prevCount: number = frequency.get(currCharacter) ?? 0;

    frequency.set(currCharacter, prevCount + dialog.length);
  }

  let values: number[] = Array.from(frequency.values());
  const labels = Array.from(frequency.keys());
  const sum = values.reduce((acc, curr) => acc + curr, 0);

  values = values.map((e) => +((e / sum) * 100).toFixed(1));

  for (let i = 0; i < labels.length; i++) {
    frequency.set(labels[i], values[i]);
  }

  return frequency;
};
