import fountain from "./fountain_parser";

/**
 * Convert .fountain format screenplay to HTML
 * @param fountainScreenplay .fountain format screenplay
 */
export const convertFountainToHTML = (fountainScreenplay: string) => {
    const output = fountain.parse(fountainScreenplay, true);
    return output["html"]["script"];
};
