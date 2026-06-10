import { beforeAll, describe, it, expect } from "vitest";

import { sha256Hex } from "@src/lib/assets/asset-hash";
import { importImageFile, loadAssetObjectUrl } from "@src/lib/assets/asset-store";
import { collectReferencedHashes, gcProjectAssets } from "@src/lib/assets/asset-gc";
import {
    getStorageProvider,
    type StoredAsset,
} from "@src/lib/persistence/storage-provider/storage-provider";
import { ProjectState } from "@src/lib/project/project-state";
import { createProjectRepository } from "@src/lib/project/project-repository";

const pid = () => `test-${Math.random().toString(36).slice(2)}`;

// The `assets` store is part of the baseline schema. A browser profile carrying
// a stale `scriptio-local` from before the store existed would lack it (we don't
// bump the store version — greenfield assumption), so reset it for a clean run.
beforeAll(async () => {
    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("scriptio-local");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
});

/** Base fields shared by the board cards used in GC tests. */
const cardBase = { title: "", description: "", color: "", x: 0, y: 0, width: 1, height: 1 };

async function putDummyAsset(projectId: string, hash: string): Promise<void> {
    const provider = await getStorageProvider();
    await provider.putAsset({
        key: `${projectId}/${hash}`,
        projectId,
        hash,
        mime: "image/png",
        size: 3,
        width: 1,
        height: 1,
        data: new TextEncoder().encode("abc").buffer as ArrayBuffer,
        createdAt: Date.now(),
    });
}

/** A real, decodable PNG so importImageFile's intrinsic-size decode succeeds. */
async function makePngFile(name: string, w: number, h: number, fill: string): Promise<File> {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    return new File([blob], name, { type: "image/png" });
}

describe("sha256Hex", () => {
    it("is deterministic and matches the known vector for 'abc'", async () => {
        const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
        expect(await sha256Hex(enc("hello"))).toBe(await sha256Hex(enc("hello")));
        expect(await sha256Hex(enc("hello"))).not.toBe(await sha256Hex(enc("world")));
        expect(await sha256Hex(enc("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});

describe("asset storage provider", () => {
    it("stores, lists, copies and deletes assets scoped per project", async () => {
        const provider = await getStorageProvider();
        const p1 = pid();
        const p2 = pid();

        const asset: StoredAsset = {
            key: `${p1}/h1`,
            projectId: p1,
            hash: "h1",
            mime: "image/png",
            size: 3,
            width: 2,
            height: 4,
            data: new TextEncoder().encode("abc").buffer as ArrayBuffer,
            createdAt: Date.now(),
        };
        await provider.putAsset(asset);

        expect(await provider.hasAsset(p1, "h1")).toBe(true);
        expect(await provider.hasAsset(p1, "missing")).toBe(false);
        expect((await provider.getAsset(p1, "h1"))?.height).toBe(4);
        expect(await provider.listAssetHashes(p1)).toEqual(["h1"]);

        // copy isolates by project key
        await provider.copyProjectAssets(p1, p2);
        expect(await provider.hasAsset(p2, "h1")).toBe(true);

        // deleting one project leaves the other intact
        await provider.deleteProjectAssets(p1);
        expect(await provider.listAssetHashes(p1)).toEqual([]);
        expect(await provider.hasAsset(p2, "h1")).toBe(true);

        await provider.deleteProjectAssets(p2);
    });
});

describe("importImageFile", () => {
    it("dedups identical bytes and captures intrinsic dimensions", async () => {
        const provider = await getStorageProvider();
        const p = pid();
        const file = await makePngFile("x.png", 20, 10, "#f00");

        const first = await importImageFile(p, file);
        expect(first.width).toBe(20);
        expect(first.height).toBe(10);

        const second = await importImageFile(p, file);
        expect(second.hash).toBe(first.hash);
        // Still exactly one stored record despite two imports.
        expect(await provider.listAssetHashes(p)).toEqual([first.hash]);

        const url = await loadAssetObjectUrl(p, first.hash);
        expect(url).toMatch(/^blob:/);
        if (url) URL.revokeObjectURL(url);

        await provider.deleteProjectAssets(p);
    });
});

describe("asset GC (reconcile from doc)", () => {
    it("collects image assetIds across every board, ignoring text cards", () => {
        const ydoc = new ProjectState();
        const repo = createProjectRepository(ydoc)!;
        const b1 = repo.createBoardDocument("B1");
        const b2 = repo.createBoardDocument("B2");

        ydoc.boardData(b1).set(
            "cards",
            JSON.stringify([
                { id: "c1", type: "image", assetId: "A", ...cardBase },
                { id: "c2", ...cardBase }, // plain text card — no assetId
            ]),
        );
        ydoc.boardData(b2).set(
            "cards",
            JSON.stringify([{ id: "c3", type: "image", assetId: "B", ...cardBase }]),
        );

        expect(collectReferencedHashes(ydoc)).toEqual(new Set(["A", "B"]));
        ydoc.destroy();
    });

    it("deletes only unreferenced assets, project-wide", async () => {
        const provider = await getStorageProvider();
        const p = pid();
        const ydoc = new ProjectState();
        const repo = createProjectRepository(ydoc)!;
        const board = repo.createBoardDocument("B1");

        ydoc.boardData(board).set(
            "cards",
            JSON.stringify([
                { id: "c1", type: "image", assetId: "A", ...cardBase },
                { id: "c2", type: "image", assetId: "B", ...cardBase },
            ]),
        );
        await putDummyAsset(p, "A");
        await putDummyAsset(p, "B");
        await putDummyAsset(p, "C"); // never referenced

        await gcProjectAssets(p, ydoc);
        expect((await provider.listAssetHashes(p)).sort()).toEqual(["A", "B"]);

        // Drop the only card referencing A → A becomes collectable, B stays.
        ydoc.boardData(board).set(
            "cards",
            JSON.stringify([{ id: "c2", type: "image", assetId: "B", ...cardBase }]),
        );
        await gcProjectAssets(p, ydoc);
        expect(await provider.listAssetHashes(p)).toEqual(["B"]);

        await provider.deleteProjectAssets(p);
        ydoc.destroy();
    });
});
