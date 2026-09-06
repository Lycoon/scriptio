import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ProjectState } from "@src/lib/project/project-doc";
import {
    armProjectLog,
    commitProjectUpdates,
    pendingProjectUpdate,
    recordProjectUpdate,
    releaseProjectLog,
} from "@src/lib/persistence/update-log";

const PROJECT = "p1";

function appendLine(doc: ProjectState, id: string, text: string): void {
    const element = new Y.XmlElement("action");
    element.setAttribute("data-id", id);
    element.insert(0, [new Y.XmlText(text)]);
    const fragment = doc.screenplayFragment();
    doc.transact(() => fragment.insert(fragment.length, [element]));
}

function textOf(doc: ProjectState): string {
    const out: string[] = [];
    doc.screenplayFragment().forEach((node) => out.push(node.toString()));
    return out.join("\n");
}

/** Mirror of the observer in project-state: every update goes to the log. */
function record(doc: ProjectState): () => void {
    const handler = (update: Uint8Array) => recordProjectUpdate(PROJECT, update);
    doc.on("update", handler);
    return () => doc.off("update", handler);
}

beforeEach(() => releaseProjectLog(PROJECT));

describe("update log", () => {
    it("is unavailable until armed, so an unarmed writer cannot under-report", () => {
        const doc = new ProjectState();
        const stop = record(doc);
        appendLine(doc, "a1", "Typed before arming");

        // Nothing was recorded: a log that has not been declared current against
        // a base cannot say what the base is missing.
        expect(pendingProjectUpdate(PROJECT)).toEqual({ kind: "unavailable" });

        stop();
        doc.destroy();
    });

    it("replays the base plus the log into the same document", () => {
        const doc = new ProjectState();
        appendLine(doc, "a1", "One");

        // The base: what a whole-archive write puts on disk.
        const base = Y.encodeStateAsUpdate(doc);
        armProjectLog(PROJECT);

        const stop = record(doc);
        appendLine(doc, "a2", "Two");
        appendLine(doc, "a3", "Three");
        const fragment = doc.screenplayFragment();
        doc.transact(() => fragment.delete(0, 1)); // deletions travel too
        stop();

        const pending = pendingProjectUpdate(PROJECT);
        expect(pending.kind).toBe("update");
        if (pending.kind !== "update") return;
        expect(pending.through).toBe(3);

        const replayed = new ProjectState();
        Y.applyUpdate(replayed, Y.mergeUpdates([base, pending.update]));
        expect(textOf(replayed)).toBe(textOf(doc));
        expect(textOf(replayed)).not.toContain("One");

        replayed.destroy();
        doc.destroy();
    });

    it("keeps what was typed during a write and drops only what was written", () => {
        const doc = new ProjectState();
        armProjectLog(PROJECT);
        const stop = record(doc);

        appendLine(doc, "a1", "Before");
        const pending = pendingProjectUpdate(PROJECT);
        expect(pending.kind).toBe("update");
        if (pending.kind !== "update") return;

        // The write is in flight; the user keeps typing.
        appendLine(doc, "a2", "During");

        // Only the entries that reached the disk are dropped.
        commitProjectUpdates(PROJECT, pending.through);

        const next = pendingProjectUpdate(PROJECT);
        expect(next.kind).toBe("update");
        if (next.kind !== "update") return;

        const replayed = new ProjectState();
        Y.applyUpdate(replayed, Y.mergeUpdates([pending.update, next.update]));
        expect(textOf(replayed)).toContain("During");

        stop();
        replayed.destroy();
        doc.destroy();
    });

    it("reports itself unavailable rather than short once it overflows", () => {
        const doc = new ProjectState();
        armProjectLog(PROJECT);
        const stop = record(doc);

        // Past the cap the log stops holding bytes: a state-vector diff is both
        // complete and smaller, so the writer is sent there instead.
        const wide = "x".repeat(4096);
        for (let i = 0; i < 1200; i++) appendLine(doc, `a${i}`, wide);

        expect(pendingProjectUpdate(PROJECT)).toEqual({ kind: "unavailable" });

        // A whole-document write re-arms it, and it is usable again.
        armProjectLog(PROJECT);
        expect(pendingProjectUpdate(PROJECT)).toEqual({ kind: "empty" });

        stop();
        doc.destroy();
    });
});
