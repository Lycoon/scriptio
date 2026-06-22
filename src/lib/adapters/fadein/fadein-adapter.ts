import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { XMLParser } from "@node_modules/fast-xml-parser/src/fxp";
import { ProjectData } from "@src/lib/project/project-state";
import { titlePageLine } from "@src/lib/titlepage/titlepage-content";
import type { JSONContent } from "@tiptap/core";
import * as fflate from "fflate";

// ─── FadeIn / Open Screenplay Format (OSF) ───────────────────────────────────────
//
// A `.fadein` file is a ZIP archive whose single entry, `document.xml`, is an
// Open Screenplay Format document:
//
//   <document type="Open Screenplay Format document" version="40">
//     <paragraphs>
//       <para>
//         <style basestyle="Dialogue"/>
//         <text>No Dad, they don't.  </text>
//         <text underline="1">I</text>
//         <text> do not like the story.</text>
//       </para>
//       ...
//     </paragraphs>
//     <titlepage> ...same <para> structure... </titlepage>
//   </document>
//
// A paragraph's type is the `basestyle` attribute on its child <style>; inline
// formatting lives on each <text> run (bold/italic/underline). A manual page
// break is `pagebreakbefore="1"` on the <style>. This is structurally the FDX
// format wrapped in a ZIP, so the conversion mirrors the Final Draft adapter.

const DOCUMENT_ENTRY = "document.xml";

// Parser options chosen for OSF specifically:
//  · trimValues:false        — FadeIn splits sentences across runs and relies on
//                              significant leading/trailing whitespace (e.g. the
//                              double space after a sentence); trimming corrupts
//                              dialogue spacing.
//  · parseTagValue / parseAttributeValue:false — keep numeric-looking text such
//                              as "(1973)" and attributes like bold="1" as strings.
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
});

// OSF basestyle → Scriptio node type. Unknown styles fall back to "action".
const OSF_ELEMENT_TABLE: Record<string, string> = {
    "Scene Heading": "scene",
    Action: "action",
    Character: "character",
    Parenthetical: "parenthetical",
    Dialogue: "dialogue",
    Transition: "transition",
    "Normal Text": "action",
};

// <text> formatting attribute → Scriptio mark type.
const OSF_MARK_TABLE: { attr: string; type: string }[] = [
    { attr: "@_bold", type: "bold" },
    { attr: "@_italic", type: "italic" },
    { attr: "@_underline", type: "underline" },
];

interface OSFTextRun {
    "#text"?: string;
    "@_bold"?: string;
    "@_italic"?: string;
    "@_underline"?: string;
}

interface OSFStyle {
    "@_basestyle"?: string;
    "@_pagebreakbefore"?: string;
}

interface OSFParagraph {
    style?: OSFStyle;
    text?: OSFTextRun | string | (OSFTextRun | string)[];
}

/** Coerce a possibly-single XML child into an array (fast-xml-parser collapses singletons). */
function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

/** Build the marks array for a single <text> run from its formatting attributes. */
function marksOf(run: OSFTextRun): { type: string }[] | undefined {
    const marks: { type: string }[] = [];
    for (const { attr, type } of OSF_MARK_TABLE) {
        if (run[attr as keyof OSFTextRun]) marks.push({ type });
    }
    return marks.length > 0 ? marks : undefined;
}

/** Build the inline text runs of an OSF <para>. */
function runsOf(para: OSFParagraph): JSONContent[] {
    const content: JSONContent[] = [];
    for (const run of asArray(para.text)) {
        const text = typeof run === "string" ? run : run["#text"] ?? "";
        if (!text) continue;

        const node: JSONContent = { type: "text", text };
        const marks = typeof run === "string" ? undefined : marksOf(run);
        if (marks) node.marks = marks;
        content.push(node);
    }
    return content;
}

/** Convert OSF <paragraphs> into Scriptio screenplay block nodes. */
function paragraphsToScreenplay(paras: OSFParagraph[]): JSONContent[] {
    return paras.map((para) => {
        const basestyle = para.style?.["@_basestyle"];
        const type = (basestyle && OSF_ELEMENT_TABLE[basestyle]) || "action";

        const attrs: Record<string, unknown> = { class: type };
        if (para.style?.["@_pagebreakbefore"]) attrs.pageBreak = true;

        return { type, attrs, content: runsOf(para) };
    });
}

/** Convert OSF <titlepage> paragraphs into title-page (`tp-text`) nodes. */
function paragraphsToTitlePage(paras: OSFParagraph[]): JSONContent[] {
    return paras.map((para) => titlePageLine(runsOf(para)));
}

export class FadeInAdapter extends ProjectAdapter<BaseExportOptions> {
    label = "FadeIn";
    extension = "fadein";

    convertTo(): Promise<Blob> {
        return Promise.reject(new Error("Export to FadeIn is not supported"));
    }

    convertFrom(rawContent: ArrayBuffer): Partial<ProjectData> {
        const unzipped = fflate.unzipSync(new Uint8Array(rawContent), {
            filter: (f) => f.name === DOCUMENT_ENTRY,
        });

        const documentBytes = unzipped[DOCUMENT_ENTRY];
        if (!documentBytes) {
            throw new Error("Invalid FadeIn file: missing document.xml");
        }

        const parsed = parser.parse(fflate.strFromU8(documentBytes));
        const document = parsed?.document;
        if (!document) {
            throw new Error("Invalid FadeIn file: not an Open Screenplay Format document");
        }

        const screenplay = paragraphsToScreenplay(asArray(document.paragraphs?.para));
        const titlepage = paragraphsToTitlePage(asArray(document.titlepage?.para));

        return { screenplay, titlepage };
    }
}
