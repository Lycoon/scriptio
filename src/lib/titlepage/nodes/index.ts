export { TitlePageTextNode } from "./text-node";
export { TitleNode, AuthorNode, DateNode, TitlePageFormatNodes } from "./format-marks";

import { TitlePageTextNode } from "./text-node";
import { TitlePageFormatNodes } from "./format-marks";

/** All title page extensions: one block node + format atom nodes */
export const TitlePageExtensions = [TitlePageTextNode, ...TitlePageFormatNodes];
