/**
 * The "a `.scenarly` arrived" flow: OS double-click, in-app Open…, or the file
 * picker, all funnelling into one place.
 *
 * Kept as a module-level store rather than React state because the trigger can
 * come from outside React entirely — a Tauri event fired by the OS, possibly
 * before any project is mounted. The dialog that renders this
 * ([ScenarlyOpenDialog]) sits at the projects layout so it is reachable from the
 * listing and from inside a project alike.
 *
 * Nothing here decides on the user's behalf: it reads the archive, asks
 * `planScenarlyOpen` what opening it would mean, and puts that question on
 * screen. The destructive-looking option — "update my project with this file" —
 * is a CRDT merge underneath, so even taking it cannot drop work.
 */

import {
    createProjectFromScenarly,
    planScenarlyOpen,
    type ScenarlyOpenPlan,
} from "@src/lib/adapters/scenarly/scenarly-open";
import { fileNameOf, isFileBindingSupported } from "@src/lib/persistence/file-binding";
import type { CookieUser } from "@src/lib/utils/types";

export interface PendingScenarlyOpen {
    plan: ScenarlyOpenPlan;
    /** The archive itself, held so the chosen action doesn't re-read the disk. */
    bytes: ArrayBuffer;
    /**
     * Where the file lives, when we know. Null for a browser `File`, which has
     * no path and therefore cannot be bound — the project is created, and that
     * is all.
     */
    path: string | null;
    fileName: string;
}

let pending: PendingScenarlyOpen | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((cb) => cb());

export function subscribeScenarlyOpen(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

export const getPendingScenarlyOpen = (): PendingScenarlyOpen | null => pending;

export function dismissScenarlyOpen(): void {
    pending = null;
    emit();
}

/** Read, classify, and put the question on screen. */
export async function offerScenarlyOpen(
    bytes: ArrayBuffer,
    fileName: string,
    path: string | null,
): Promise<void> {
    pending = { plan: await planScenarlyOpen(bytes), bytes, path, fileName };
    emit();
}

/** Read a path from disk (desktop) and offer it. */
export async function offerScenarlyOpenFromPath(path: string): Promise<void> {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await offerScenarlyOpen(buffer, fileNameOf(path), path);
}

/** The native picker's filter — one place, so every entry point matches. */
export const SCENARLY_FILE_FILTER = { name: "Scenarly", extensions: ["scenarly"] };

/**
 * Ask for a `.scenarly` and run it through the open flow.
 *
 * Lives here rather than beside a button because two places need it — the
 * project library, and the recovery path for a binding whose file has moved —
 * and they must agree on what the picker accepts.
 */
export async function pickAndOfferScenarlyFile(): Promise<void> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: [SCENARLY_FILE_FILTER] });
    if (typeof path === "string") await offerScenarlyOpenFromPath(path);
}

/**
 * Bind the opened project to the file it came from, so edits flow back to it.
 *
 * Only for files opened from a real path — and only where binding is supported
 * at all. Failing to bind must never fail the open: the project is already
 * created or merged by this point, and a binding is an extra, not a
 * prerequisite.
 */
async function bindIfPossible(projectId: string, path: string | null): Promise<void> {
    if (!path || !isFileBindingSupported()) return;
    try {
        const { bindProject } = await import("@src/lib/persistence/file-binding");
        await bindProject(projectId, path);
    } catch (error) {
        console.warn("[Scenarly] Opened the file but could not bind to it:", error);
    }
}

/** Merge the pending archive into an existing local project. */
export async function acceptScenarlyMerge(projectId: string): Promise<string> {
    const current = pending;
    if (!current) throw new Error("No file is waiting to be opened");

    const { applyScenarlyUpdate } = await import("@src/lib/adapters/scenarly/scenarly-open");
    await applyScenarlyUpdate(projectId, current.bytes);
    await bindIfPossible(projectId, current.path);

    dismissScenarlyOpen();
    return projectId;
}

/**
 * Create a project from the pending archive.
 *
 * `fork` is the whole subtlety of this flow. Receiving a file for a project you
 * do not have preserves its lineage — you are now a peer of the sender, and the
 * next file they send merges cleanly instead of piling up as another copy, which
 * is what lets a file circulate through a writing group. Choosing "open as a new
 * project" *while you already hold that document* is the opposite statement, and
 * mints a fresh lineage so the two stay independent.
 */
export async function acceptScenarlyAsNewProject(
    fork: boolean,
    user: CookieUser | null | undefined,
    isPro: boolean | undefined,
): Promise<string> {
    const current = pending;
    if (!current) throw new Error("No file is waiting to be opened");

    const projectId = await createProjectFromScenarly(current.bytes, {
        fork,
        title: current.fileName.replace(/\.[^/.]+$/, ""),
        user,
        isPro,
    });
    await bindIfPossible(projectId, current.path);

    dismissScenarlyOpen();
    return projectId;
}
