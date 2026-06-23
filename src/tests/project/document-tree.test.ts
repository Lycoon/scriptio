import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ProjectState, DocumentNode } from "@src/lib/project/project-state";
import { createProjectRepository } from "@src/lib/project/project-repository";

function makeRepo() {
    const ydoc = new ProjectState();
    const repo = createProjectRepository(ydoc)!;
    return { ydoc, repo };
}

describe("document tree repository", () => {
    it("creates nested folders and an editor document", () => {
        const { repo } = makeRepo();
        const f1 = repo.createFolder("Act One");
        const f2 = repo.createFolder("Sequence", f1);
        const d1 = repo.createEditorDocument("Outline", f2);

        const docs = repo.documents;
        expect(docs[f1].parentId).toBe(null);
        expect(docs[f2].parentId).toBe(f1);
        expect(docs[d1].parentId).toBe(f2);
        expect(docs[d1].type).toBe("editor");
        expect(docs[f1].type).toBe("folder");
    });

    it("appends siblings in ascending order", () => {
        const { repo } = makeRepo();
        const a = repo.createEditorDocument("A");
        const b = repo.createEditorDocument("B");
        const c = repo.createEditorDocument("C");
        const docs = repo.documents;
        expect(docs[a].order).toBeLessThan(docs[b].order);
        expect(docs[b].order).toBeLessThan(docs[c].order);
    });

    it("moveDocument reparents, reorders, and blocks cyclic moves", () => {
        const { repo } = makeRepo();
        const parent = repo.createFolder("P");
        const child = repo.createFolder("C", parent);
        const doc = repo.createEditorDocument("D");

        repo.moveDocument(doc, parent, 5);
        expect(repo.documents[doc].parentId).toBe(parent);
        expect(repo.documents[doc].order).toBe(5);

        // Moving a folder into one of its own descendants must be a no-op.
        repo.moveDocument(parent, child, 0);
        expect(repo.documents[parent].parentId).toBe(null);
    });

    it("renames a node", () => {
        const { repo } = makeRepo();
        const id = repo.createFolder("Old");
        repo.renameDocument(id, "New");
        expect(repo.documents[id].title).toBe("New");
    });

    it("deletes a folder subtree and clears editor fragments", () => {
        const { ydoc, repo } = makeRepo();
        const folder = repo.createFolder("F");
        const sub = repo.createFolder("Sub", folder);
        const doc = repo.createEditorDocument("D", sub);

        // Give the editor document some content in its fragment.
        const frag = ydoc.documentFragment(doc);
        frag.insert(0, [new Y.XmlElement("action")]);
        expect(frag.length).toBe(1);

        repo.deleteDocument(folder);
        const docs = repo.documents;
        expect(docs[folder]).toBeUndefined();
        expect(docs[sub]).toBeUndefined();
        expect(docs[doc]).toBeUndefined();
        expect(ydoc.documentFragment(doc).length).toBe(0);
    });

    it("createBoardDocument creates independent boards", () => {
        const { repo } = makeRepo();
        const b1 = repo.createBoardDocument("Board A");
        const b2 = repo.createBoardDocument("Board B");
        expect(b1).not.toBe(b2);
        const boards = Object.values(repo.documents).filter((n: DocumentNode) => n.type === "board");
        expect(boards).toHaveLength(2);
    });

    it("deleting a board node clears its own board data map", () => {
        const { ydoc, repo } = makeRepo();
        const b1 = repo.createBoardDocument("Board A");
        const b2 = repo.createBoardDocument("Board B");
        ydoc.boardData(b1).set("cards", JSON.stringify([{ id: "x" }]));
        ydoc.boardData(b2).set("cards", JSON.stringify([{ id: "y" }]));

        repo.deleteDocument(b1);
        expect(repo.documents[b1]).toBeUndefined();
        expect(ydoc.boardData(b1).get("cards")).toBeUndefined();
        // The other board is untouched.
        expect(repo.documents[b2]).toBeDefined();
        expect(ydoc.boardData(b2).get("cards")).toBe(JSON.stringify([{ id: "y" }]));
    });

    it("observeDocuments fires on changes", () => {
        const { repo } = makeRepo();
        let received: Record<string, DocumentNode> = {};
        const unsubscribe = repo.observeDocuments((docs) => {
            received = docs;
        });
        const id = repo.createFolder("Watched");
        expect(received[id]?.title).toBe("Watched");
        unsubscribe();
    });
});
