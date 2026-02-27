import { LayoutData, ProjectData, ProjectMetadata, ProjectState } from "@src/lib/project/project-state";
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import * as fflate from "fflate";
import * as Y from "yjs";

// ─── File Header ──────────────────────────────────────────────────────────────
//
//  Offset  Size  Description
//  ──────  ────  ──────────────────────────────────────────────────────────────
//   0       8    Magic bytes: ASCII "SCRIPTIO"
//   8       1    Version (u8):  current = 1
//   9       1    Flags   (u8):  bit 0 → 0 = zlib-compressed binary Yjs state
//                                        1 = human-readable JSON (ProjectData)
//  10       …    Payload
//
const MAGIC = new Uint8Array([0x53, 0x43, 0x52, 0x49, 0x50, 0x54, 0x49, 0x4f]); // "SCRIPTIO"
const CURRENT_VERSION = 1;
const HEADER_SIZE = MAGIC.length + 1 + 1; // 8 magic + 1 version + 1 flags = 10 bytes

const FLAG_READABLE_JSON = 0x01; // bit 0: payload is UTF-8 JSON, not compressed Yjs

export type ScriptioExportOptions = BaseExportOptions & {
    /** When true, the payload is indented JSON (ProjectData) instead of compressed binary Yjs state. */
    readable?: boolean;
};

function buildHeader(version: number, flags: number): Uint8Array {
    const header = new Uint8Array(HEADER_SIZE);
    header.set(MAGIC, 0);
    header[MAGIC.length] = version;
    header[MAGIC.length + 1] = flags;
    return header;
}

function parseHeader(data: Uint8Array): { version: number; flags: number; payloadOffset: number } {
    if (data.length < HEADER_SIZE) {
        throw new Error("File is too short to be a valid .scriptio file");
    }

    for (let i = 0; i < MAGIC.length; i++) {
        if (data[i] !== MAGIC[i]) {
            throw new Error("Invalid .scriptio file: magic bytes not found");
        }
    }

    const version = data[MAGIC.length];
    if (version > CURRENT_VERSION) {
        throw new Error(`Unsupported .scriptio file version: ${version}. Please update Scriptio.`);
    }

    const flags = data[MAGIC.length + 1];
    return { version, flags, payloadOffset: HEADER_SIZE };
}

export class ScriptioAdapter extends ProjectAdapter<ScriptioExportOptions> {
    label = "Scriptio";
    extension = "scriptio";

    convertTo(project: ProjectState, options: ScriptioExportOptions): Promise<Blob> {
        const isReadable = options.readable ?? false;
        const flags = isReadable ? FLAG_READABLE_JSON : 0x00;
        const header = buildHeader(CURRENT_VERSION, flags);

        let payload: Uint8Array;

        if (isReadable) {
            // Human-readable path: serialize the full project as indented JSON.
            // This produces a larger file but makes the content inspectable
            // with any text editor.
            const data: ProjectData = {
                screenplay: project.screenplay(),
                metadata: project.metadata().toJSON() as ProjectMetadata,
                characters: project.characters().toJSON(),
                scenes: project.scenes().toJSON(),
                cards: project.cards().toJSON(),
                locations: project.locations().toJSON(),
                board: project.board().toJSON(),
                layout: project.layout().toJSON() as LayoutData,
            };
            payload = new TextEncoder().encode(JSON.stringify(data, null, 2));
        } else {
            // Binary path: zlib-compress the raw Yjs state.
            // Preserves the full CRDT document, including collaboration history.
            const yjsState = Y.encodeStateAsUpdate(project);
            payload = fflate.zlibSync(yjsState, { level: 9 });
        }

        const file = new Uint8Array(header.length + payload.length);
        file.set(header, 0);
        file.set(payload, header.length);

        return Promise.resolve(new Blob([file], { type: "application/octet-stream" }));
    }

    convertFrom(rawContent: ArrayBuffer): ProjectData {
        const data = new Uint8Array(rawContent);
        const { flags, payloadOffset } = parseHeader(data);
        const payload = data.subarray(payloadOffset);

        const isReadable = (flags & FLAG_READABLE_JSON) !== 0;

        if (isReadable) {
            // JSON path: decode UTF-8 and parse directly into ProjectData.
            try {
                const json = new TextDecoder().decode(payload);
                return JSON.parse(json) as ProjectData;
            } catch (error) {
                console.error("Failed to parse readable .scriptio file", error);
                throw new Error("Invalid Scriptio file format");
            }
        }

        // Binary path: decompress Yjs state, apply to a temporary doc, read fields.
        const tmpDoc = new ProjectState();
        try {
            const decompressed = fflate.unzlibSync(payload);
            Y.applyUpdate(tmpDoc, decompressed);

            return {
                screenplay: tmpDoc.screenplay(),
                metadata: tmpDoc.metadata().toJSON() as ProjectMetadata,
                characters: tmpDoc.characters().toJSON(),
                scenes: tmpDoc.scenes().toJSON(),
                cards: tmpDoc.cards().toJSON(),
                locations: tmpDoc.locations().toJSON(),
                board: tmpDoc.board().toJSON(),
                layout: tmpDoc.layout().toJSON() as LayoutData,
            };
        } catch (error) {
            console.error("Failed to parse .scriptio file", error);
            throw new Error("Invalid Scriptio file format");
        } finally {
            tmpDoc.destroy();
        }
    }
}
