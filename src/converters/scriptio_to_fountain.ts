/**
 * Convert editor JSON screenplay to .fountain format
 * @param json editor content JSON
 * @returns .fountain format screenplay
 */
export const convertJSONtoFountain = (json: any): string => {
  let fountain = "";
  let sceneCount = 1;
  let nodes = json.content!;

  const isNode = (type: string, check: string): boolean => {
    return type === check;
  };

  for (let i = 0; i < nodes.length; i++) {
    const type: string = nodes[i]["attrs"]["class"];
    const text: string = nodes[i]["content"][0]["text"];
    const nextType: string =
      i >= nodes.length - 1 ? undefined : nodes[i + 1]["attrs"]["class"];

    switch (type) {
      case "scene":
        fountain += "." + text.toUpperCase() + " #" + sceneCount + ".#";
        fountain += isNode(nextType, "character") ? "" : "\n";
        sceneCount++;
        break;
      case "action":
        fountain += "!" + text;
        fountain += isNode(nextType, "character") ? "" : "\n";
        break;
      case "character":
        fountain += "\n@" + text;
        break;
      case "transition":
        fountain += "\n>" + text.toUpperCase() + ":\n";
        break;
      case "parenthetical":
        fountain += "(" + text + ")";
        break;
      case "dialogue":
        fountain += text;
        fountain += isNode(nextType, "action") ? "\n" : "";
        break;
      default:
        fountain += text;
    }

    fountain += "\n";
  }

  return fountain;
};
