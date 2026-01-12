import FileSaver from "file-saver";
import { replaceScreenplay } from "../screenplay/editor";
import { Screenplay } from "../utils/types";
import { Editor } from "@tiptap/react";

export type BaseExportOptions = {
    title: string;
    author: string;
    includeNotes: boolean;
    characters?: string[]; // undefined means all characters
    notesColor?: string;
};

export abstract class ScreenplayAdapter<TExportOptions extends BaseExportOptions = BaseExportOptions> {
    abstract label: string; // e.g., "Final Draft (.fdx)"
    abstract extension: string; // e.g., "fdx"

    abstract convertTo(content: Screenplay, options: TExportOptions): Promise<Blob>;
    abstract convertFrom(rawContent: string): Screenplay;

    public async export(screenplay: Screenplay, options: TExportOptions): Promise<void> {
        try {
            const blob = await this.convertTo(screenplay, options);
            FileSaver.saveAs(blob, `${options.title}.${this.extension}`);
        } catch (error) {
            console.error(`Failed to export to ${this.label}`, error);
            throw new Error("Export failed");
        }
    }

    public import(rawContent: string, editor: Editor): void {
        try {
            const screenplay = this.convertFrom(rawContent);
            replaceScreenplay(editor, screenplay);
        } catch (error) {
            console.error(`Failed to import from ${this.label}`, error);
            throw new Error("Import failed or file is corrupt");
        }
    }
}
