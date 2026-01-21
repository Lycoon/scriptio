import FileSaver from "file-saver";
import { replaceScreenplay } from "../screenplay/editor";
import { Editor } from "@tiptap/react";
import { ProjectData, ProjectState } from "../project/project-state";

export type BaseExportOptions = {
    title: string;
    author: string;
    includeNotes: boolean;
    characters?: string[]; // undefined means all characters
    notesColor?: string;
};

export abstract class ProjectAdapter<TExportOptions extends BaseExportOptions = BaseExportOptions> {
    abstract label: string; // e.g., "Final Draft (.fdx)"
    abstract extension: string; // e.g., "fdx"

    abstract convertTo(project: ProjectState, options: TExportOptions): Promise<Blob>;
    abstract convertFrom(rawContent: ArrayBuffer): Partial<ProjectData>;

    public async export(project: ProjectState, options: TExportOptions): Promise<void> {
        try {
            const blob = await this.convertTo(project, options);
            FileSaver.saveAs(blob, `${options.title}.${this.extension}`);
        } catch (error) {
            console.error(`Failed to export to ${this.label}`, error);
            throw new Error("Export failed");
        }
    }

    public import(rawContent: ArrayBuffer, editor: Editor): void {
        try {
            const project = this.convertFrom(rawContent);
            if (project.screenplay) replaceScreenplay(editor, project.screenplay);
        } catch (error) {
            console.error(`Failed to import from ${this.label}`, error);
            throw new Error("Import failed or file is corrupt");
        }
    }
}
