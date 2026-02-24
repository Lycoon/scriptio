import FileSaver from "file-saver";
import { isTauri } from "@tauri-apps/api/core";
import { replaceScreenplay } from "../screenplay/editor";
import { Editor } from "@tiptap/react";
import { ProjectData, ProjectState } from "../project/project-state";

export type BaseExportOptions = {
    title: string;
    author: string;
    projectAuthor?: string;
    includeNotes: boolean;
    characters?: string[]; // undefined means all characters
    notesColor?: string;
    onProgress?: (progress: number) => void;
};

export abstract class ProjectAdapter<TExportOptions extends BaseExportOptions = BaseExportOptions> {
    abstract label: string; // e.g., "Final Draft (.fdx)"
    abstract extension: string; // e.g., "fdx"

    abstract convertTo(project: ProjectState, options: TExportOptions): Promise<Blob>;
    abstract convertFrom(rawContent: ArrayBuffer): Partial<ProjectData>;

    public async export(project: ProjectState, options: TExportOptions): Promise<void> {
        try {
            const blob = await this.convertTo(project, options);

            if (isTauri()) {
                await this.exportDesktop(blob, options);
            } else {
                FileSaver.saveAs(blob, `${options.title}.${this.extension}`);
            }
        } catch (error) {
            console.error(`Failed to export to ${this.label}`, error);
            throw new Error("Export failed");
        }
    }

    private async exportDesktop(blob: Blob, options: TExportOptions): Promise<void> {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");

        const filePath = await save({
            defaultPath: `${options.title}.${this.extension}`,
            filters: [{ name: this.label, extensions: [this.extension] }],
        });

        if (!filePath) return;

        const buffer = new Uint8Array(await blob.arrayBuffer());
        await writeFile(filePath, buffer);
        await revealItemInDir(filePath);
    }

    public import(rawContent: ArrayBuffer, editor: Editor): void {
        try {
            const project = this.convertFrom(rawContent);
            console.log("Converted project data:", project);
            if (project.screenplay) replaceScreenplay(editor, project.screenplay);
        } catch (error) {
            console.error(`Failed to import from ${this.label}`, error);
            throw new Error("Import failed or file is corrupt");
        }
    }
}
