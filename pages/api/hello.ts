import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  name: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    res.status(404).json({ name: "Error" });
    return;
  }

  const body = req.body;
  const fountain = convertJSONtoFountain(body);

  res.status(200).json({ name: fountain });
}

/**
 * Convert TipTap JSON screenplay to .fountain format
 * @param json
 * @returns .fountain format screenplay
 */
function convertJSONtoFountain(json: any): string {
  let fountain = "";
  let sceneCount = 1;

  const isNode = (type: string, check: string): boolean => {
    return type === check;
  };

  for (let i = 0; i < json.length; i++) {
    const type: string = json[i]["type"];
    const text: string = json[i]["content"][0]["text"];
    const nextType: string =
      i >= json.length - 1 ? undefined : json[i + 1]["type"];

    switch (type) {
      case "Scene":
        fountain += "." + text.toUpperCase() + " #" + sceneCount + ".#";
        fountain += isNode(nextType, "Character") ? "" : "\n";
        sceneCount++;
        break;
      case "Action":
        fountain += "!" + text;
        fountain += isNode(nextType, "Character") ? "" : "\n";
        break;
      case "Character":
        fountain += "\n@" + text;
        break;
      case "Transition":
        fountain += "\n>" + text.toUpperCase() + ":\n";
        break;
      case "Parenthetical":
        fountain += "(" + text + ")";
        break;
      case "Dialogue":
        fountain += text;
        fountain += isNode(nextType, "Action") ? "\n" : "";
        break;
      default:
        fountain += text;
        break;
    }

    fountain += "\n";
  }

  return fountain;
}
