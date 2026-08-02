import FileSaver from "file-saver";
import { isTauri } from "@tauri-apps/api/core";
import { isIOS } from "../utils/platform";
import { replaceScreenplay } from "../screenplay/editor";
import { Editor } from "@tiptap/react";
import { LayoutData, ProjectData, ProjectMetadata, ProjectState } from "../project/project-state";
import { ProjectRepository } from "../project/project-repository";
import { ExportFormat } from "../utils/enums";

export type BaseExportOptions = {
    title: string;
    author: string;
    projectAuthor?: string;
    includeNotes: boolean;
    characters?: string[]; // undefined means all characters
    notesColor?: string;
    onProgress?: (progress: number) => void;
};

/**
 * What an adapter WRITES: the id the export UI asks for, and the extension of
 * the file that comes out. Paired in one value because a format either has both
 * or neither — an id without an extension would name the file `Script.undefined`.
 *
 * The two are usually the same string but must not be assumed to be: formatted
 * text answers to `TEXT` while writing `.txt`, because `.txt` on import belongs
 * to Fountain (see `FountainAdapter.importExtensions`).
 */
export type ExportTarget = {
    /** Id the export UI asks for. Type-checked against the enum it offers. */
    format: ExportFormat;
    /** Suffix of the written file, lower-case and without the dot, e.g. "fdx". */
    extension: string;
};

export abstract class ProjectAdapter<TExportOptions extends BaseExportOptions = BaseExportOptions> {
    /** Human-readable format name, e.g. "Final Draft". Shown in the save dialog. */
    abstract label: string;

    /** How this format is written, or `null` when it can only be read. */
    abstract exportTarget: ExportTarget | null;

    /**
     * File extensions this adapter can READ, lower-case and without the dot, or
     * `[]` when the format can only be written.
     *
     * Declared per adapter with no default, so reading and writing are stated
     * independently: most formats own their extension in both directions, but
     * Fountain also claims `.txt`, and `.txt` is written by a different adapter
     * than the one that reads it.
     */
    abstract importExtensions: string[];

    abstract convertTo(project: ProjectState, options: TExportOptions): Promise<Blob>;
    abstract convertFrom(rawContent: ArrayBuffer): Partial<ProjectData>;

    public async export(project: ProjectState, options: TExportOptions): Promise<void> {
        // Import-only formats have no target and no working `convertTo`; fail
        // with something readable rather than on a missing extension later.
        const target = this.exportTarget;
        if (!target) throw new Error(`${this.label} cannot be exported`);

        try {
            const blob = await this.convertTo(project, options);

            if (isTauri() && isIOS()) {
                await this.exportIOS(blob, options, target);
            } else if (isTauri()) {
                await this.exportDesktop(blob, options, target);
            } else {
                FileSaver.saveAs(blob, `${options.title}.${target.extension}`);
            }
        } catch (error) {
            console.error(`Failed to export to ${this.label}`, error);
            throw new Error("Export failed");
        }
    }

    /**
     * iOS has no "choose a path, then write to it" dialog. `UIDocumentPicker` in
     * `.exportToService` mode only moves an *existing* file to a location the
     * user picks, so tauri-plugin-dialog's `save()` fakes the cross-platform
     * shape: it creates a placeholder at `<Documents>/<fileName>`, hands that to
     * the picker, and returns where the user put it.
     *
     * The copy therefore happens when the user confirms — before we ever get the
     * path back. Writing after `save()` resolves, the way desktop does, exports
     * the empty placeholder and leaves a 0-byte file: the destination URL is
     * outside our sandbox, so the later write lands nowhere the user can see.
     *
     * So stage the real bytes at exactly the path the plugin will use and let
     * the picker export those. It only creates the placeholder
     * (`if !fileManager.fileExists`) when nothing is there, so a pre-written file
     * survives — this hooks that, rather than fighting it.
     *
     * The staged copy is left behind on purpose. The app declares neither
     * `UIFileSharingEnabled` nor `LSSupportsOpeningDocumentsInPlace`, so
     * `<Documents>` is invisible to the user, one file per title at most; and
     * deleting it would race the picker's copy for cloud destinations.
     */
    private async exportIOS(blob: Blob, options: TExportOptions, target: ExportTarget): Promise<void> {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");

        // The plugin derives its staging path with `PathBuf::file_name()`, which
        // would drop everything before a separator in the title and stage under a
        // name we never wrote. Keep the two in lockstep.
        const fileName = `${options.title.replace(/[\\/:*?"<>|]/g, "-")}.${target.extension}`;

        const buffer = new Uint8Array(await blob.arrayBuffer());
        await writeFile(fileName, buffer, { baseDir: BaseDirectory.Document });

        // Resolves to the chosen destination, or null if cancelled. Either way the
        // export is already done — there is nothing left for us to write.
        await save({
            defaultPath: fileName,
            filters: [{ name: this.label, extensions: [target.extension] }],
        });
    }

    private async exportDesktop(blob: Blob, options: TExportOptions, target: ExportTarget): Promise<void> {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");

        const filePath = await save({
            defaultPath: `${options.title}.${target.extension}`,
            filters: [{ name: this.label, extensions: [target.extension] }],
        });

        if (!filePath) return;

        const buffer = new Uint8Array(await blob.arrayBuffer());
        await writeFile(filePath, buffer);
        await revealItemInDir(filePath);
    }

    public import(
        rawContent: ArrayBuffer,
        editor?: Editor | null,
        titlePageEditor?: Editor | null,
        repository?: ProjectRepository | null,
    ): void {
        try {
            const project = this.convertFrom(rawContent);
            console.log("Converted project data:", project);

            if (project.screenplay && editor) {
                replaceScreenplay(editor, project.screenplay);
            }

            if (project.titlepage && titlePageEditor) {
                replaceScreenplay(titlePageEditor, project.titlepage);
            }

            // If we have a repository, we can import maps (scenes, characters, etc.)
            if (repository) {
                const ydoc = repository.getState();

                ydoc.transact(() => {
                    if (project.metadata) {
                        const metadataMap = ydoc.metadata();
                        Object.entries(project.metadata).forEach(([key, value]) => {
                            metadataMap.set(key as keyof ProjectMetadata, value);
                        });
                    }

                    if (project.characters) {
                        const charactersMap = ydoc.characters();
                        charactersMap.clear();
                        Object.entries(project.characters).forEach(([key, value]) => {
                            charactersMap.set(key, value);
                        });
                    }

                    if (project.locations) {
                        const locationsMap = ydoc.locations();
                        locationsMap.clear();
                        Object.entries(project.locations).forEach(([key, value]) => {
                            locationsMap.set(key, value);
                        });
                    }

                    if (project.scenes) {
                        const scenesMap = ydoc.scenes();
                        scenesMap.clear();
                        Object.entries(project.scenes).forEach(([key, value]) => {
                            scenesMap.set(key, value);
                        });
                    }

                    if (project.layout) {
                        const layoutMap = ydoc.layout();
                        Object.entries(project.layout).forEach(([key, value]) => {
                            layoutMap.set(key as keyof LayoutData, value);
                        });
                    }

                    if (project.comments) {
                        const commentsMap = ydoc.comments();
                        commentsMap.clear();
                        Object.entries(project.comments).forEach(([key, value]) => {
                            commentsMap.set(key, value);
                        });
                    }
                });
            }
        } catch (error) {
            console.error(`Failed to import from ${this.label}`, error);
            throw new Error("Import failed or file is corrupt");
        }
    }
}
