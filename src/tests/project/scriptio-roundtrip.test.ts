import { describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import * as fflate from "fflate";

import {
    ProjectState,
    applyProjectData,
    clearProjectData,
    projectDataOf,
} from "@src/lib/project/project-state";
import { createProjectRepository } from "@src/lib/project/project-repository";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { ScriptioAdapter } from "@src/lib/adapters/scriptio/scriptio-adapter";

const action = (id: string, text: string) => ({
    type: "action",
    attrs: { "data-id": id, class: "action" },
    content: [{ type: "text", text }],
});

/**
 * Build a project that exercises every shared type the adapter must preserve:
 * screenplay + title-page fragments, all the metadata-ish maps, the document
 * tree (folder / editor / board), an editor doc's own content, a board's data,
 * the outline, a shelf entry with version content, and the custom dictionary.
 */
function buildPopulatedProject(): ProjectState {
    const ydoc = new ProjectState();
    const repo = createProjectRepository(ydoc)!;

    repo.transact(() => {
        // Screenplay
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            { type: "doc", content: [action("a1", "Hello world"), action("a2", "Second line")] },
            ydoc.screenplayFragment(),
        );

        // Maps reachable through the repository
        repo.setTitle("My Script");
        repo.setAuthor("Ada");
        ydoc.characters().set("c1", { name: "ALICE" } as never);
        ydoc.locations().set("l1", { name: "OFFICE" } as never);
        repo.upsertScene("s1", { synopsis: "Opening", color: "#ff0000" });
        repo.upsertPage("p1", { splitOffset: 3 });
        repo.setPageSize("A4" as never);
        repo.setSceneLocking(true);
        repo.setSkippedSceneLetters(["I", "O", "Q"]);
        repo.addComment({ nodeId: "b1", text: "note", author: "Ada", createdAt: 0, resolved: false, replies: [] });
        ydoc.dictionary().set("zoetrope", true);
    });

    // Document tree: folder > editor doc + board
    const folder = repo.createFolder("Act One");
    const editorDoc = repo.createEditorDocument("Beat Sheet", folder);
    const board = repo.createBoardDocument("Corkboard", folder);

    // Editor doc content lives in its own fragment
    repo.transact(() => {
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            { type: "doc", content: [action("b1", "Beat one")] },
            ydoc.documentFragment(editorDoc),
        );
        ydoc.boardData(board).set("cards", JSON.stringify([{ id: "k1", title: "Idea" }]));
        ydoc.boardData(board).set("arrows", JSON.stringify([]));
    });

    // Outline references the main screenplay
    repo.addOutlineItem({
        parentId: null,
        source: "scene",
        refDocId: "screenplay",
        refId: "s1",
        title: "Opening",
        preview: "Hello world",
    });

    // Shelf entry with one version (writes a shelf_<node>_<version> fragment)
    repo.shelveNode("s1", "Opening", "scene", [action("v1", "Shelved opening")]);

    return ydoc;
}

const baseOptions = { title: "My Script", author: "Ada", includeNotes: false };

async function exportBuffer(project: ProjectState, readable: boolean): Promise<ArrayBuffer> {
    const adapter = new ScriptioAdapter();
    const blob = await adapter.convertTo(project, { ...baseOptions, readable });
    return blob.arrayBuffer();
}

/** Fields that should survive an export/import round trip untouched. */
function snapshot(data: ReturnType<typeof projectDataOf>) {
    return {
        screenplay: data.screenplay,
        titlepage: data.titlepage,
        metadata: data.metadata,
        characters: data.characters,
        scenes: data.scenes,
        pages: data.pages,
        locations: data.locations,
        layout: data.layout,
        production: data.production,
        comments: data.comments,
        documents: data.documents,
        outline: data.outline,
        shelf: data.shelf,
        dictionary: data.dictionary,
        documentContent: data.documentContent,
        boardContent: data.boardContent,
        shelfContent: data.shelfContent,
    };
}

describe("scriptio adapter full round trip", () => {
    for (const readable of [false, true]) {
        const label = readable ? "readable JSON" : "binary";

        it(`preserves every shared type (${label})`, async () => {
            const original = buildPopulatedProject();
            const before = snapshot(projectDataOf(original));

            const adapter = new ScriptioAdapter();
            const buffer = await exportBuffer(original, readable);
            const parsed = adapter.convertFrom(buffer);

            // Rebuild a fresh document from the parsed data, exactly like the
            // new-project import path does.
            const rebuilt = new ProjectState();
            applyProjectData(rebuilt, parsed);
            const after = snapshot(projectDataOf(rebuilt));

            expect(after).toEqual(before);

            original.destroy();
            rebuilt.destroy();
        });
    }

    it("names the document entry by type and writes a header-free readable JSON", async () => {
        const project = buildPopulatedProject();
        const adapter = new ScriptioAdapter();

        const readableZip = fflate.unzipSync(
            new Uint8Array(await (await adapter.convertTo(project, { ...baseOptions, readable: true })).arrayBuffer()),
        );
        expect(Object.keys(readableZip)).toContain("document.json");
        expect(Object.keys(readableZip)).not.toContain("document.ydoc");

        // The readable entry is pure JSON — no binary header to strip first.
        const text = fflate.strFromU8(readableZip["document.json"]);
        expect(text.trimStart().startsWith("{")).toBe(true);
        expect(JSON.parse(text).metadata.title).toBe("My Script");

        const binaryZip = fflate.unzipSync(
            new Uint8Array(await (await adapter.convertTo(project, { ...baseOptions, readable: false })).arrayBuffer()),
        );
        expect(Object.keys(binaryZip)).toContain("document.ydoc");
        expect(Object.keys(binaryZip)).not.toContain("document.json");

        project.destroy();
    });

    it("writes an uncompressed mimetype as the first archive entry", async () => {
        const project = buildPopulatedProject();
        const adapter = new ScriptioAdapter();
        const blob = await adapter.convertTo(project, { ...baseOptions, readable: false });
        const bytes = new Uint8Array(await blob.arrayBuffer());

        // First ZIP local file header, then its filename and (stored) content.
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
        const nameLen = bytes[26] | (bytes[27] << 8);
        const extraLen = bytes[28] | (bytes[29] << 8);
        expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLen))).toBe("mimetype");

        // Stored (not deflated): the value appears verbatim right after the name.
        const dataStart = 30 + nameLen + extraLen;
        const mimetype = "application/vnd.scriptio+zip";
        expect(new TextDecoder().decode(bytes.slice(dataStart, dataStart + mimetype.length))).toBe(
            mimetype,
        );

        project.destroy();
    });

    it("clearProjectData wipes maps and dynamic fragments before a replace", () => {
        const ydoc = buildPopulatedProject();
        clearProjectData(ydoc);

        expect(ydoc.documents().size).toBe(0);
        expect(ydoc.shelf().size).toBe(0);
        expect(ydoc.scenes().size).toBe(0);
        expect(ydoc.dictionary().size).toBe(0);
        expect(ydoc.screenplayFragment().length).toBe(0);

        ydoc.destroy();
    });

    it("clear-then-apply replaces rather than merges (no stale entries)", () => {
        const original = buildPopulatedProject();
        const exported = projectDataOf(original);

        // Target already holds unrelated data that must not survive the import.
        const target = buildPopulatedProject();
        target.scenes().set("stale", { synopsis: "old" } as never);
        target.dictionary().set("stale-word", true);

        clearProjectData(target);
        applyProjectData(target, exported);

        expect(target.scenes().has("stale")).toBe(false);
        expect(target.dictionary().has("stale-word")).toBe(false);
        expect(projectDataOf(target).scenes).toEqual(exported.scenes);

        original.destroy();
        target.destroy();
    });
});
