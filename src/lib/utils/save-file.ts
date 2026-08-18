/**
 * Hand a blob to the user as a file.
 *
 * The three environments the app ships in each save differently, and the iOS
 * one is genuinely surprising, so every caller goes through here rather than
 * rediscovering it: the browser downloads, Tauri desktop opens a save dialog and
 * reveals the result, and Tauri iOS has to stage the bytes before it can ask.
 */

import FileSaver from "file-saver";
import { isTauri } from "@tauri-apps/api/core";

import { isIOS } from "../utils/platform";

/** How the native save dialog labels and filters the file being written. */
export type SaveFileFilter = {
    /** Human-readable format name shown in the dialog, e.g. "Final Draft". */
    label: string;
    /** Suffix, lower-case and without the dot, e.g. "fdx". */
    extension: string;
};

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
 * `<Documents>` is invisible to the user, one file per name at most; and
 * deleting it would race the picker's copy for cloud destinations.
 */
async function saveIOS(blob: Blob, fileName: string, filter: SaveFileFilter): Promise<void> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");

    // The plugin derives its staging path with `PathBuf::file_name()`, which
    // would drop everything before a separator in the name and stage under a
    // name we never wrote. Keep the two in lockstep.
    const staged = fileName.replace(/[\\/:*?"<>|]/g, "-");

    const buffer = new Uint8Array(await blob.arrayBuffer());
    await writeFile(staged, buffer, { baseDir: BaseDirectory.Document });

    // Resolves to the chosen destination, or null if cancelled. Either way the
    // save is already done — there is nothing left for us to write.
    await save({
        defaultPath: staged,
        filters: [{ name: filter.label, extensions: [filter.extension] }],
    });
}

async function saveDesktop(blob: Blob, fileName: string, filter: SaveFileFilter): Promise<void> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");

    const filePath = await save({
        defaultPath: fileName,
        filters: [{ name: filter.label, extensions: [filter.extension] }],
    });

    if (!filePath) return;

    const buffer = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, buffer);
    await revealItemInDir(filePath);
}

/** Write `blob` to wherever this platform puts user-saved files. */
export async function saveBlob(blob: Blob, fileName: string, filter: SaveFileFilter): Promise<void> {
    if (isTauri() && isIOS()) {
        await saveIOS(blob, fileName, filter);
    } else if (isTauri()) {
        await saveDesktop(blob, fileName, filter);
    } else {
        FileSaver.saveAs(blob, fileName);
    }
}
