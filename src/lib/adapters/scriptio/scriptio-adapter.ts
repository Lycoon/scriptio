import { ProjectData, ProjectState, applyProjectData, clearProjectData, projectDataOf } from "@src/lib/project/project-state";
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import { ExportFormat } from "@src/lib/utils/enums";
import { replaceScreenplay } from "../../screenplay/editor";
import { Editor } from "@tiptap/react";
import { ProjectRepository } from "../../project/project-repository";
import { collectReferencedHashes } from "@src/lib/assets/asset-gc";
import {
    getStorageProvider,
    type StoredAsset,
} from "@src/lib/persistence/storage-provider/storage-provider";
import * as fflate from "fflate";
import * as Y from "yjs";

// ─── Container format ──────────────────────────────────────────────────────────
//
// A `.scriptio` file is a ZIP archive:
//
//   mimetype               `application/vnd.scriptio+zip`. First entry, STORED
//                          (uncompressed) so the type is sniffable by content at
//                          a fixed offset — the EPUB/ODF/OOXML convention.
//   document.json   ─┐     Exactly one document entry, named by its type:
//   document.ydoc   ─┘       · document.json — readable export: the project
//                              serialized as JSON (ProjectData). A snapshot, so
//                              it carries no CRDT collaboration history.
//                            · document.ydoc — binary export: the raw Yjs
//                              document update, preserving the full CRDT state.
//                          Either way the bytes are deflated by the ZIP itself;
//                          there is no inner header — the entry name says how to
//                          read it, and the schema version lives in the doc's
//                          `metadata.version` (the migration runner gates on it).
//   assets/manifest.json   Metadata for every bundled asset (mime, size, dims).
//   assets/<hash>.<ext>    Raw bytes of each board image, content-addressed by
//                          its SHA-256 (the `assetId` referenced by board cards).
//
// Image bytes are decoupled from the Yjs document (they live in IndexedDB at
// runtime); bundling them under `assets/` is what makes an exported project
// self-contained.

// ZIP local-file-header magic ("PK\x03\x04"), used to recognise the archive.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * Content type identifying the archive. Written as the first entry, uncompressed,
 * so a sniffer (libmagic/`file`, the OS) can recognise a `.scriptio` by content
 * even if it's renamed — the same trick EPUB and OpenDocument use. The `+zip`
 * suffix (RFC 6839) advertises the ZIP-based structure.
 */
const SCRIPTIO_MIMETYPE = "application/vnd.scriptio+zip";

const ZIP_MIMETYPE_ENTRY = "mimetype";
const ZIP_DOCUMENT_JSON = "document.json"; // readable export (ProjectData JSON)
const ZIP_DOCUMENT_YDOC = "document.ydoc"; // binary export (raw Yjs update)
const ZIP_ASSET_DIR = "assets/";
const ZIP_ASSET_MANIFEST = "assets/manifest.json";

export type ScriptioExportOptions = BaseExportOptions & {
    /** When true, the document is indented JSON (ProjectData) instead of binary Yjs state. */
    readable?: boolean;
    /**
     * Owning project id, used to read the project's board image assets from
     * local storage and bundle them under `assets/`. When omitted, the archive
     * carries the document only (no assets).
     */
    projectId?: string;
};

interface AssetManifestEntry {
    /** ZIP entry path of the bytes, e.g. `assets/<hash>.png`. */
    file: string;
    /** SHA-256 hex — the assetId referenced by board cards. */
    hash: string;
    mime: string;
    width: number;
    height: number;
    size: number;
}

interface AssetManifest {
    version: 1;
    assets: AssetManifestEntry[];
}

/** Does this buffer start with the ZIP local-file-header magic? */
function isZipArchive(data: Uint8Array): boolean {
    return data.length >= ZIP_MAGIC.length && ZIP_MAGIC.every((b, i) => data[i] === b);
}

/** File extension (with leading dot) for a bundled asset of the given mime. */
function extensionForMime(mime: string): string {
    switch (mime) {
        case "image/png":
            return ".png";
        case "image/jpeg":
            return ".jpg";
        case "image/gif":
            return ".gif";
        case "image/webp":
            return ".webp";
        case "image/avif":
            return ".avif";
        case "image/bmp":
            return ".bmp";
        case "image/svg+xml":
            return ".svg";
        case "audio/mp4":
            return ".m4a";
        case "audio/aac":
            return ".aac";
        case "audio/mpeg":
            return ".mp3";
        case "audio/wav":
        case "audio/x-wav":
            return ".wav";
        case "audio/ogg":
            return ".ogg";
        case "audio/webm":
            return ".webm";
        default:
            return "";
    }
}

// ── Reading the document entry ───────────────────────────────────────────────────

/** Decompress just the document entry (skip assets) from a ZIP archive. */
function unzipDocument(data: Uint8Array): fflate.Unzipped {
    if (!isZipArchive(data)) throw new Error("Not a .scriptio archive");
    return fflate.unzipSync(data, {
        filter: (f) => f.name === ZIP_DOCUMENT_JSON || f.name === ZIP_DOCUMENT_YDOC,
    });
}

/** Read a Yjs update into a throwaway doc and serialize it to ProjectData. */
function projectDataFromYjsUpdate(update: Uint8Array): ProjectData {
    const tmpDoc = new ProjectState();
    try {
        Y.applyUpdate(tmpDoc, update);
        return projectDataOf(tmpDoc);
    } finally {
        tmpDoc.destroy();
    }
}

/** Parse the document entry of a ZIP archive into ProjectData. */
function parseZipDocument(unzipped: fflate.Unzipped): ProjectData {
    const json = unzipped[ZIP_DOCUMENT_JSON];
    if (json) {
        try {
            return JSON.parse(fflate.strFromU8(json)) as ProjectData;
        } catch (error) {
            console.error("Failed to parse readable Scriptio document", error);
            throw new Error("Invalid Scriptio file format");
        }
    }

    const ydoc = unzipped[ZIP_DOCUMENT_YDOC];
    if (ydoc) {
        try {
            return projectDataFromYjsUpdate(ydoc);
        } catch (error) {
            console.error("Failed to parse Scriptio document", error);
            throw new Error("Invalid Scriptio file format");
        }
    }

    throw new Error("Invalid .scriptio archive: missing document entry");
}

// ── Asset bundling ───────────────────────────────────────────────────────────────

/**
 * Read the project's board image assets from local storage and turn them into
 * ZIP entries (raw bytes + a manifest). Returns an empty map when the project
 * references no images or none are stored locally.
 */
async function buildAssetEntries(
    projectId: string,
    project: ProjectState,
): Promise<fflate.Zippable> {
    const entries: fflate.Zippable = {};

    let referenced: Set<string>;
    try {
        referenced = collectReferencedHashes(project);
    } catch {
        // A board with an unparseable cards blob — bundle the document anyway.
        return entries;
    }
    if (referenced.size === 0) return entries;

    const provider = await getStorageProvider();
    const manifest: AssetManifest = { version: 1, assets: [] };

    for (const hash of referenced) {
        const asset = await provider.getAsset(projectId, hash);
        if (!asset) continue; // referenced but not stored locally — skip

        const file = `${ZIP_ASSET_DIR}${hash}${extensionForMime(asset.mime)}`;
        // Images are already compressed; storing them with level 0 avoids a
        // pointless second deflate pass over the whole archive's bytes.
        entries[file] = [new Uint8Array(asset.data), { level: 0 }];
        manifest.assets.push({
            file,
            hash,
            mime: asset.mime,
            width: asset.width,
            height: asset.height,
            size: asset.size,
        });
    }

    if (manifest.assets.length > 0) {
        entries[ZIP_ASSET_MANIFEST] = fflate.strToU8(JSON.stringify(manifest, null, 2));
    }
    return entries;
}

/**
 * Restore the board image assets bundled in a `.scriptio` archive into local
 * storage under `projectId`. No-ops for archives without an asset manifest, and
 * safe to call for any imported file — non-archive content is ignored.
 */
export async function restoreScriptioAssets(
    projectId: string,
    rawContent: ArrayBuffer,
): Promise<void> {
    const data = new Uint8Array(rawContent);
    if (!isZipArchive(data)) return;

    let unzipped: fflate.Unzipped;
    try {
        unzipped = fflate.unzipSync(data, { filter: (f) => f.name.startsWith(ZIP_ASSET_DIR) });
    } catch (error) {
        console.warn("[Scriptio] Failed to read bundled assets:", error);
        return;
    }

    const manifestBytes = unzipped[ZIP_ASSET_MANIFEST];
    if (!manifestBytes) return;

    let manifest: AssetManifest;
    try {
        manifest = JSON.parse(fflate.strFromU8(manifestBytes)) as AssetManifest;
    } catch (error) {
        console.warn("[Scriptio] Invalid asset manifest:", error);
        return;
    }

    const provider = await getStorageProvider();
    await Promise.all(
        manifest.assets.map(async (entry) => {
            const bytes = unzipped[entry.file];
            if (!bytes) return;

            // `slice()` copies the bytes into a standalone ArrayBuffer so the
            // stored asset doesn't retain the entire decompressed archive.
            const asset: StoredAsset = {
                key: `${projectId}/${entry.hash}`,
                projectId,
                hash: entry.hash,
                mime: entry.mime,
                size: entry.size ?? bytes.byteLength,
                width: entry.width,
                height: entry.height,
                data: bytes.slice().buffer,
                createdAt: Date.now(),
            };
            await provider.putAsset(asset);
        }),
    );
}

export class ScriptioAdapter extends ProjectAdapter<ScriptioExportOptions> {
    label = "Scriptio";
    exportTarget = { format: ExportFormat.SCRIPTIO, extension: "scriptio" };
    importExtensions = ["scriptio"];

    async convertTo(project: ProjectState, options: ScriptioExportOptions): Promise<Blob> {
        const readable = options.readable ?? false;

        // Readable: pretty-printed ProjectData JSON (a snapshot, no CRDT history).
        // Binary: the raw Yjs update, preserving full collaboration history. The
        // ZIP deflates either one — there's no inner header.
        const documentName = readable ? ZIP_DOCUMENT_JSON : ZIP_DOCUMENT_YDOC;
        const documentBytes = readable
            ? fflate.strToU8(JSON.stringify(projectDataOf(project), null, 2))
            : new Uint8Array(Y.encodeStateAsUpdate(project));

        // Insertion order is preserved by fflate, so `mimetype` stays first.
        // Stored (level 0) and first, its value lands at the fixed byte offset
        // where content sniffers expect it.
        const zipEntries: fflate.Zippable = {
            [ZIP_MIMETYPE_ENTRY]: [fflate.strToU8(SCRIPTIO_MIMETYPE), { level: 0 }],
            [documentName]: [documentBytes, { level: 9 }],
        };

        if (options.projectId) {
            try {
                Object.assign(zipEntries, await buildAssetEntries(options.projectId, project));
            } catch (error) {
                // Never fail the whole export over an asset read hiccup — the
                // document is the essential part.
                console.warn("[Scriptio] Failed to bundle assets:", error);
            }
        }

        const archive = fflate.zipSync(zipEntries, { level: 6 });
        // Re-wrap as an ArrayBuffer-backed view: fflate types its output as
        // Uint8Array<ArrayBufferLike>, which BlobPart won't accept directly.
        return new Blob([new Uint8Array(archive)], { type: SCRIPTIO_MIMETYPE });
    }

    convertFrom(rawContent: ArrayBuffer): ProjectData {
        return parseZipDocument(unzipDocument(new Uint8Array(rawContent)));
    }

    public import(
        rawContent: ArrayBuffer,
        editor?: Editor | null,
        titlePageEditor?: Editor | null,
        repository?: ProjectRepository | null,
    ): void {
        if (repository) {
            const ydoc = repository.getState() as ProjectState;
            try {
                const unzipped = unzipDocument(new Uint8Array(rawContent));

                // Truly "replace" the project: wipe every existing map and
                // fragment first so the import never merges with prior data.
                clearProjectData(ydoc);

                const ydocUpdate = unzipped[ZIP_DOCUMENT_YDOC];
                if (ydocUpdate) {
                    // Applying the raw Yjs update preserves the full CRDT state,
                    // including any collaboration history baked into the file.
                    Y.applyUpdate(ydoc, ydocUpdate);
                } else {
                    const json = unzipped[ZIP_DOCUMENT_JSON];
                    if (!json) throw new Error("Invalid .scriptio archive: missing document entry");
                    applyProjectData(ydoc, JSON.parse(fflate.strFromU8(json)) as ProjectData);
                }

                // Refresh editors if provided
                const projectData = this.convertFrom(rawContent);
                if (editor && projectData.screenplay) {
                    replaceScreenplay(editor, projectData.screenplay);
                }
                if (titlePageEditor && projectData.titlepage) {
                    replaceScreenplay(titlePageEditor, projectData.titlepage);
                }

                return;
            } catch (error) {
                console.warn("Failed to apply Scriptio update directly, falling back to base import.", error);
            }
        }

        // Fallback to the base implementation if no repository is available.
        super.import(rawContent, editor, titlePageEditor, repository);
    }
}
