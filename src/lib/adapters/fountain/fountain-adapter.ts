import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";

import fountain from "./fountain_parser";
import { generateJSON, JSONContent } from "@tiptap/react";
import { getNodeFlattenContent } from "@src/lib/screenplay/screenplay";
import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { ProjectData, ProjectState, screenplayOf, titlepageOf } from "@src/lib/project/project-state";

export class FountainAdapter extends ProjectAdapter {
    label = "Fountain Script";
    extension = "fountain";

    /**
     * Resolve a title page format node to its Fountain key and display value.
     */
    private resolveTitlePageNode(
        type: string,
        options: BaseExportOptions,
    ): { key: string; value: string } | null {
        switch (type) {
            case "tp-title":
                return { key: "Title", value: options.title || "" };
            case "tp-author":
                return { key: "Author", value: options.projectAuthor || "" };
            case "tp-date":
                return {
                    key: "Draft date",
                    value: new Date().toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    }),
                };
            default:
                return null;
        }
    }

    /**
     * Build Fountain title page from the actual title page TipTap document.
     * Maps format nodes to Fountain keys (Title, Author, Draft date)
     * and plain text lines to Credit.
     */
    private buildFountainTitlePage(project: ProjectState, options: BaseExportOptions): string {
        const titlePageContent = titlepageOf(project);
        if (!titlePageContent || titlePageContent.length === 0) return "";

        const lines: string[] = [];

        for (const node of titlePageContent) {
            if (node.type !== "tp-text") continue;

            const content = node.content;

            // Empty line (no content) — skip in Fountain title page (key-value only)
            if (!content || content.length === 0) continue;

            // Check if this line contains a format node
            const formatChild = content.find(
                (c: JSONContent) => c.type === "tp-title" || c.type === "tp-author" || c.type === "tp-date",
            );

            if (formatChild) {
                const resolved = this.resolveTitlePageNode(formatChild.type!, options);
                if (resolved && resolved.value) {
                    lines.push(`${resolved.key}: ${resolved.value}`);
                }
                continue;
            }

            // Plain text line — flatten and use as Credit
            const text = content
                .map((c: JSONContent) => c.text ?? "")
                .join("")
                .trim();
            if (text) {
                lines.push(`Credit: ${text}`);
            }
        }

        if (lines.length === 0) return "";
        return lines.join("\n") + "\n\n";
    }

    convertTo(project: ProjectState, options: BaseExportOptions): Promise<Blob> {
        // Build title page from actual document
        let fountain = this.buildFountainTitlePage(project, options);

        let sceneCount = 1;
        const nodes = screenplayOf(project);
        const characters = options.characters;

        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i]["content"]) continue;

            const content = nodes[i].content!;
            const flatText: string = getNodeFlattenContent(content);
            const type: string = nodes[i].attrs?.class;
            const nextType: string = i >= nodes.length - 1 ? undefined : nodes[i + 1].attrs?.class;

            if (type === "note" && !options.includeNotes) continue;
            if (type === "character" && characters && !characters.includes(flatText)) {
                // Don't export unselected characters
                let j = i + 1;
                for (; j < nodes.length; j++) {
                    const typeJ: string = nodes[j]["attrs"]!["class"];
                    if (typeJ === "dialogue" || typeJ === "parenthetical") {
                        continue;
                    }

                    break;
                }
                i = j - 1;
                continue;
            }

            // Handle styled text fragments
            let fullText: string = "";
            for (let j = 0; j < content.length; j++) {
                console.log("Marks: ", content[j].marks);
                const styles: string[] = (content[j].marks ?? []).map((mark) => mark.type);
                const childNode = content[j];
                let textFragment: string = "text" in childNode ? childNode.text! : "";

                if (styles.includes("bold")) textFragment = "**" + textFragment + "**";
                if (styles.includes("italic")) textFragment = "*" + textFragment + "*";
                if (styles.includes("underline")) textFragment = "_" + textFragment + "_";

                fullText += textFragment;
            }

            switch (type) {
                case "scene":
                    fountain += "\n." + fullText.toUpperCase() + " #" + sceneCount + ".#";
                    fountain += nextType === "character" ? "" : "\n";
                    sceneCount++;
                    break;
                case "action":
                    fountain += "!" + fullText;
                    fountain += nextType === "character" ? "" : "\n";
                    break;
                case "character":
                    fountain += "\n@" + fullText;
                    break;
                case "transition":
                    fountain += "\n>" + fullText.toUpperCase() + ":\n";
                    break;
                case "parenthetical":
                    fountain += "(" + fullText + ")";
                    break;
                case "section":
                    fountain += "# " + fullText;
                    break;
                case "dialogue":
                    fountain += fullText;
                    fountain += nextType === "action" ? "\n" : "";
                    break;
                case "note":
                    fountain += "\n[[" + fullText + "]]";
                    break;
                default:
                    fountain += fullText;
            }

            fountain += "\n";
        }

        const blob = new Blob([fountain], { type: "text/plain;charset=utf-8" });
        return Promise.resolve(blob);
    }

    convertFrom(rawContent: ArrayBuffer): Partial<ProjectData> {
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(rawContent);
        const output = fountain.parse(text, true);
        const html = output["html"]["script"];
        const json = generateJSON(html, BASE_EXTENSIONS) as JSONContent;

        const project: Partial<ProjectData> = {
            screenplay: json.content as JSONContent[],
        };

        return project;
    }
}
