import { afterEach, describe, expect, it, vi } from "vitest";

import {
    loadPosterBlob,
    pushPendingPoster,
    revalidatePoster,
    savePosterFromFile,
} from "@src/lib/posters/poster-store";
import {
    createCachedProjectWithId,
    deleteCachedProject,
    markCachedProjectAsSynced,
} from "@src/lib/persistence/storage-provider/local-persistence";
import { getStorageProvider } from "@src/lib/persistence/storage-provider/storage-provider";

const pid = () => `poster-test-${Math.random().toString(36).slice(2)}`;

/** A real, decodable JPEG so `savePosterFromFile`'s re-encode path runs for real. */
async function makeImageFile(fill: string): Promise<File> {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 60;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg"));
    return new File([blob], "poster.jpg", { type: "image/jpeg" });
}

/** Stub `fetch` with a canned poster response, and report what was requested. */
function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
    const spy = vi.fn((input: RequestInfo, init?: RequestInit) =>
        impl(typeof input === "string" ? input : input.url, init),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
}

const ok = async () => new Response(null, { status: 200 });
const offline = async () => {
    throw new TypeError("Failed to fetch");
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("posters on a local-only project", () => {
    it("stores and reads back a poster without ever touching the network", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "local", undefined, false);
        const spy = stubFetch(ok);

        await savePosterFromFile(id, await makeImageFile("#c00"));

        const blob = await loadPosterBlob(id);
        expect(blob).not.toBeNull();
        expect(blob!.size).toBeGreaterThan(0);
        expect(blob!.type).toBe("image/jpeg");
        expect(spy).not.toHaveBeenCalled();

        await deleteCachedProject(id);
    });

    it("uploads the poster it already had once the project is promoted to the cloud", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "local", undefined, false);
        await savePosterFromFile(id, await makeImageFile("#0c0"));

        const provider = await getStorageProvider();
        expect((await provider.getPoster(id))?.pendingUpload).toBe(true);

        // Promotion flips the cached entry to synced, then pushes what's local.
        await markCachedProjectAsSynced(id);
        const spy = stubFetch(ok);
        await pushPendingPoster(id);

        expect(spy).toHaveBeenCalledTimes(1);
        const [url, init] = spy.mock.calls[0];
        expect(url).toContain(`/api/projects/${id}/poster`);
        expect(init?.method).toBe("PUT");
        expect((await provider.getPoster(id))?.pendingUpload).toBe(false);

        await deleteCachedProject(id);
    });

    it("drops the poster when the project is deleted", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "local", undefined, false);
        await savePosterFromFile(id, await makeImageFile("#00c"));

        await deleteCachedProject(id);

        const provider = await getStorageProvider();
        expect(await provider.getPoster(id)).toBeNull();
    });

    it("carries the poster to the new id when a cloud project is migrated to local", async () => {
        const oldId = pid();
        const newId = pid();
        await createCachedProjectWithId(oldId, "cloud", undefined, true);
        stubFetch(ok);
        await savePosterFromFile(oldId, await makeImageFile("#cc0"));

        const provider = await getStorageProvider();
        await provider.copyPoster(oldId, newId);

        const copied = await provider.getPoster(newId);
        expect(copied?.hash).toBe((await provider.getPoster(oldId))!.hash);

        await deleteCachedProject(oldId);
        await deleteCachedProject(newId);
    });
});

describe("posters on a cloud-synced project", () => {
    it("pulls the poster from the cloud on a local cache miss, then serves it locally", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "cloud", undefined, true);

        const bytes = await (await makeImageFile("#0cc")).arrayBuffer();
        const spy = stubFetch(
            async () =>
                new Response(bytes, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        );

        const blob = await loadPosterBlob(id);
        expect(blob?.size).toBe(bytes.byteLength);
        expect(spy).toHaveBeenCalledTimes(1);

        // Cached now: the second read is local, which is what works offline.
        const offlineSpy = stubFetch(offline);
        expect((await loadPosterBlob(id))?.size).toBe(bytes.byteLength);
        expect(offlineSpy).not.toHaveBeenCalled();

        await deleteCachedProject(id);
    });

    it("loads the poster on a fresh device, before the project reaches the local cache", async () => {
        const id = pid(); // listed by the API, not yet written to IndexedDB
        const bytes = await (await makeImageFile("#333")).arrayBuffer();
        const spy = stubFetch(
            async () =>
                new Response(bytes, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        );

        // Without the membership hint an uncached project is assumed local-only,
        // so no request fires for it.
        expect(await loadPosterBlob(id)).toBeNull();
        expect(spy).not.toHaveBeenCalled();

        expect((await loadPosterBlob(id, true))?.size).toBe(bytes.byteLength);
        expect(spy).toHaveBeenCalledTimes(1);

        await (await getStorageProvider()).deletePoster(id);
    });

    it("keeps a poster set while offline and pushes it on the next open", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "cloud", undefined, true);

        stubFetch(offline);
        await savePosterFromFile(id, await makeImageFile("#c0c"));

        const provider = await getStorageProvider();
        const pending = await provider.getPoster(id);
        expect(pending?.pendingUpload).toBe(true);
        // Still rendered from the local copy despite the failed upload.
        expect((await loadPosterBlob(id))?.size).toBeGreaterThan(0);

        const spy = stubFetch(ok);
        await pushPendingPoster(id);

        expect(spy).toHaveBeenCalledTimes(1);
        expect((await provider.getPoster(id))?.pendingUpload).toBe(false);

        await deleteCachedProject(id);
    });

    it("never lets the stale cloud copy overwrite a poster still waiting to upload", async () => {
        const id = pid();
        await createCachedProjectWithId(id, "cloud", undefined, true);

        // What a previous session left behind: local bytes that never reached R2.
        const provider = await getStorageProvider();
        const mine = await (await makeImageFile("#111")).arrayBuffer();
        await provider.putPoster({
            projectId: id,
            mime: "image/jpeg",
            data: mine,
            hash: "local-hash",
            pendingUpload: true,
            updatedAt: Date.now(),
        });

        // Revalidating now would pull the older cloud bytes — it must not run.
        const stale = await (await makeImageFile("#eee")).arrayBuffer();
        const spy = stubFetch(
            async () =>
                new Response(stale, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        );
        expect((await loadPosterBlob(id))?.size).toBe(mine.byteLength);
        await revalidatePoster(id);

        expect(spy).not.toHaveBeenCalled();
        expect((await provider.getPoster(id))?.hash).toBe("local-hash");

        await deleteCachedProject(id);
    });
});
