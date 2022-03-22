/**
 * Convert editor JSON screenplay to .fountain format
 * @param json editor content JSON
 * @returns .fountain format screenplay
 */
export const convertJSONtoFountain = async (json: any): Promise<string> => {
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
    }

    fountain += "\n";
  }

  return fountain;
};
