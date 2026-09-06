import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
    DATA_START,
    commitSlotOffset,
    decodeCommit,
    encodeCommit,
    encodeIdentity,
    readHeader,
} from "@src/lib/persistence/project-file/format";
import {
    openProjectFile,
    rangeReaderFor,
    readAssetBytes,
    readDocumentUpdate,
    isProjectFile,
} from "@src/lib/persistence/project-file/reader";
import {
    planAppend,
    planRewrite,
    type AssetInput,
    type WritePlan,
} from "@src/lib/persistence/project-file/writer";

/** A file on a very small disk: apply write ops, growing as needed. */
function apply(file: Uint8Array, plan: WritePlan, ops = plan.writes.length): Uint8Array {
    let out = file;
    for (const write of plan.writes.slice(0, ops)) {
        const end = write.offset + write.bytes.length;
        if (end > out.length) {
            const grown = new Uint8Array(end);
            grown.set(out);
            out = grown;
        }
        out.set(write.bytes, write.offset);
    }
    return out;
}

const asset = (hash: string, size: number): AssetInput => ({
    hash,
    bytes: new Uint8Array(size).fill(0xab),
    mime: "image/png",
    width: 800,
    height: 600,
    size,
});

function docUpdate(lines: string[]): Uint8Array {
    const doc = new Y.Doc();
    const text = doc.getText("screenplay");
    doc.transact(() => lines.forEach((line) => text.insert(text.length, line + "\n")));
    const update = Y.encodeStateAsUpdate(doc);
    doc.destroy();
    return update;
}

function textOf(update: Uint8Array): string {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const out = doc.getText("screenplay").toString();
    doc.destroy();
    return out;
}

/** Open a materialised file the way the import path does — from memory. */
const open = (file: Uint8Array) => openProjectFile(rangeReaderFor(file), file.length);

/** A header region with the two commit slots set to the given generations. */
function headerWith(a: number | null, b: number | null): Uint8Array {
    const head = new Uint8Array(DATA_START);
    head.set(encodeIdentity({ version: 1 }), 0);
    if (a !== null)
        head.set(encodeCommit({ generation: a, indexOffset: 1000, fileSize: 2000 }), commitSlotOffset(0));
    if (b !== null)
        head.set(encodeCommit({ generation: b, indexOffset: 3000, fileSize: 4000 }), commitSlotOffset(1));
    return head;
}

describe("project file header", () => {
    it("round-trips a commit, and rejects a damaged one", () => {
        const encoded = encodeCommit({ generation: 7, indexOffset: 4096, fileSize: 6000 });
        expect(decodeCommit(encoded)?.generation).toBe(7);
        expect(decodeCommit(encoded)?.indexOffset).toBe(4096);

        const damaged = encoded.slice();
        damaged[10] ^= 0xff;
        // A checksum, not a hope: a half-written commit must not read as a
        // plausible pointer.
        expect(decodeCommit(damaged)).toBeNull();
    });

    it("takes the newer slot and writes the older one", () => {
        const chosen = readHeader(headerWith(9, 4))!;
        expect(chosen.commit.generation).toBe(9);
        // The slot in force is never the one a save overwrites.
        expect(chosen.writeSlot).toBe(1);

        const other = readHeader(headerWith(3, 8))!;
        expect(other.commit.generation).toBe(8);
        expect(other.writeSlot).toBe(0);
    });

    it("falls back to the intact slot when a commit was interrupted", () => {
        const head = headerWith(4, 5);
        // Slot B was being written when the power went: half of generation 5.
        head.fill(0xcc, commitSlotOffset(1) + 4, commitSlotOffset(1) + 12);

        const chosen = readHeader(head)!;
        expect(chosen.commit.generation).toBe(4);
        // And the next save retries into the slot that failed.
        expect(chosen.writeSlot).toBe(1);
    });

    it("is not a project file without the identity", () => {
        const head = headerWith(1, null);
        head[0] ^= 0xff;
        expect(readHeader(head)).toBeNull();
    });
});

describe("project file", () => {
    it("writes and reads back a document with its assets", async () => {
        const plan = planRewrite([asset("aaa", 1024), asset("bbb", 2048)], docUpdate(["FADE IN:"]));
        const file = apply(new Uint8Array(0), plan);

        expect(isProjectFile(file)).toBe(true);

        const opened = await open(file);
        expect(opened.identity.version).toBe(1);
        expect([...opened.index.assets.keys()].sort()).toEqual(["aaa", "bbb"]);
        expect(opened.freeBytes).toBe(0);

        expect(textOf((await readDocumentUpdate(rangeReaderFor(file), opened))!)).toContain("FADE IN:");
        expect((await readAssetBytes(rangeReaderFor(file), opened, "aaa"))!.length).toBe(1024);
    });

    it("appends a save without rewriting a byte of what is there", async () => {
        const file = apply(new Uint8Array(0), planRewrite([asset("aaa", 64 * 1024)], docUpdate(["One"])));
        const before = file.slice();

        const opened = await open(file);
        const plan = planAppend(opened.commit, opened.writeSlot, {
            update: docUpdate(["One", "Two"]),
            seq: 2,
        });
        const after = apply(file, plan);

        // Everything past the header is untouched; only the commit slot the
        // reader was *not* using has changed.
        expect(after.subarray(DATA_START, before.length)).toEqual(before.subarray(DATA_START));

        const reopened = await open(after);
        expect(textOf((await readDocumentUpdate(rangeReaderFor(after), reopened))!)).toContain("Two");
        expect(reopened.index.pages).toBe(2);
    });

    it("removes an asset for the price of a tombstone", async () => {
        const big = 4 * 1024 * 1024;
        const file = apply(new Uint8Array(0), planRewrite([asset("keep", 1024), asset("huge", big)], docUpdate(["One"])));

        const opened = await open(file);
        const plan = planAppend(opened.commit, opened.writeSlot, { removed: ["huge"] });

        // The whole point: dropping a four-megabyte image writes a few hundred
        // bytes, and reads none of it.
        const written = plan.writes.reduce((n, write) => n + write.bytes.length, 0);
        expect(written).toBeLessThan(1024);

        const after = apply(file, plan);
        const reopened = await open(after);
        expect(reopened.index.assets.has("huge")).toBe(false);
        expect(reopened.index.assets.has("keep")).toBe(true);
        expect(await readAssetBytes(rangeReaderFor(after), reopened, "huge")).toBeNull();

        // Its bytes are still in the file — that is the free space the panel
        // offers to reclaim.
        expect(reopened.freeBytes).toBeGreaterThan(big - 1024);
        expect(reopened.freeFraction).toBeGreaterThan(0.2);
    });

    it("reclaims free space by rewriting, and comes back with none", async () => {
        const file = apply(new Uint8Array(0), planRewrite([asset("keep", 1024), asset("huge", 4 * 1024 * 1024)], docUpdate(["One"])));
        const opened = await open(file);
        const stale = apply(
            file,
            planAppend(opened.commit, opened.writeSlot, { removed: ["huge"] }),
        );

        const before = await open(stale);
        const document = await readDocumentUpdate(rangeReaderFor(stale), before);

        const compacted = apply(new Uint8Array(0), planRewrite([asset("keep", 1024)], document));
        const after = await open(compacted);

        expect(after.freeBytes).toBe(0);
        expect(compacted.length).toBeLessThan(stale.length / 2);
        expect(after.index.pages).toBe(1);
        expect(textOf((await readDocumentUpdate(rangeReaderFor(compacted), after))!)).toContain("One");
    });

    it("survives a commit that never finished", async () => {
        const file = apply(new Uint8Array(0), planRewrite([asset("aaa", 2048)], docUpdate(["Committed"])));

        const opened = await open(file);
        const plan = planAppend(opened.commit, opened.writeSlot, {
            update: docUpdate(["Committed", "Never landed"]),
            seq: 2,
        });

        // Everything except the commit record: the crash happens between the data
        // and the write that would adopt it.
        const torn = apply(file, plan, plan.writes.length - 1);

        const reopened = await open(torn);
        const text = textOf((await readDocumentUpdate(rangeReaderFor(torn), reopened))!);
        expect(text).toContain("Committed");
        expect(text).not.toContain("Never landed");
    });

    it("keeps an asset that was removed and added back", async () => {
        const file = apply(new Uint8Array(0), planRewrite([asset("aaa", 512)], docUpdate(["One"])));
        let current = file;

        for (const change of [{ removed: ["aaa"] }, { assets: [asset("aaa", 512)] }]) {
            const opened = await open(current);
            current = apply(
                current,
                planAppend(
                    opened.commit,
                    opened.writeSlot,
                    change,
                ),
            );
        }

        // Newest record wins, so the re-add shadows its own tombstone.
        const reopened = await open(current);
        expect(reopened.index.assets.has("aaa")).toBe(true);
        expect((await readAssetBytes(rangeReaderFor(current), reopened, "aaa"))!.length).toBe(512);
    });
});
