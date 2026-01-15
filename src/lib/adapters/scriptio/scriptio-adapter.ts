import { ProjectData, ProjectState } from "@src/lib/project/project-yjs";
import { BaseExportOptions, ProjectAdapter } from "../screenplay-adapter";
import * as fflate from "fflate";

import * as Y from "yjs";

export class ScriptioAdapter extends ProjectAdapter {
    label = "Scriptio";
    extension = "scriptio";

    convertTo(project: ProjectState, options: BaseExportOptions): Promise<Blob> {
        const decompressed = Y.encodeStateAsUpdate(project);
        const compressed = fflate.zlibSync(decompressed, { level: 9 });
        const blob = new Blob([compressed as any], { type: "text/plain;charset=utf-8" });
        return Promise.resolve(blob);
    }

    convertFrom(rawContent: ArrayBuffer): ProjectData {
        const tmpDoc = new ProjectState();
        try {
            const compressed = new Uint8Array(rawContent);
            const decompressed = fflate.unzlibSync(compressed);
            Y.applyUpdate(tmpDoc, decompressed);

            const project: ProjectData = {
                screenplay: tmpDoc.screenplay,
                metadata: tmpDoc.metadata.toJSON(),
                characters: tmpDoc.characters.toJSON(),
                scenes: tmpDoc.scenes.toJSON(),
                cards: tmpDoc.cards.toJSON(),
                locations: tmpDoc.locations.toJSON(),
                board: tmpDoc.board.toJSON(),
                layout: tmpDoc.layout.toJSON(),
            };

            return project;
        } catch (error) {
            console.error("Failed to parse .scriptio file", error);
            throw new Error("Invalid Scriptio file format");
        } finally {
            tmpDoc.destroy();
        }
    }
}
