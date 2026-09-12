"use client";

import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import { UserContext } from "@src/context/UserContext";
import { autoSavePopup, confirmFileBindPopup, saveToFilePopup } from "@src/lib/screenplay/popup";
import { SCENARLY_FILE_FILTER } from "@src/lib/import/scenarly-file-open";

import {
    SUGGEST_COMPACT_FRACTION,
    bindProject,
    checkBindTarget,
    compactFileBinding,
    flushNow,
    getFileBindingStatus,
    isFileBindingSupported,
    markManualSave,
    subscribeFileBindings,
    unbindProject,
    UNBOUND,
    type BindRefusal,
    type FileBindingStatus,
} from "./file-binding";

/**
 * Live status of a project's bound file.
 *
 * The binding store lives outside React (it is driven by document edits, window
 * focus and the OS), so this reads it through `useSyncExternalStore`. The server
 * snapshot is always "unbound": no file binding can exist during SSR, and
 * anything else would mismatch on hydration.
 */
export function useFileBindingStatus(projectId: string | null): FileBindingStatus {
    const snapshot = useCallback(
        () => (projectId ? getFileBindingStatus(projectId) : UNBOUND),
        [projectId],
    );
    return useSyncExternalStore(subscribeFileBindings, snapshot, () => UNBOUND);
}

export interface FileActions {
    status: FileBindingStatus;
    /** False on web and mobile, where the affordances are absent rather than disabled. */
    isSupported: boolean;
    /** ⌘S: flush a bound project, or offer to bind an unbound one. */
    save: () => Promise<void>;
    /** Always asks for a path, then binds to it. */
    saveAs: () => Promise<void>;
    /** Point an existing binding at the file's new home after it moved. */
    locate: () => Promise<void>;
    /** Show the bound file in Finder/Explorer. */
    reveal: () => Promise<void>;
    /** Forget the file. It is left on disk exactly as it is. */
    stopSaving: () => Promise<void>;
    /** Lay the file out again with only what is live, reclaiming free space. */
    compact: () => Promise<void>;
    /**
     * How much of the file is space nothing uses any more, when it is worth
     * mentioning — undefined otherwise, so the panel has nothing to decide.
     *
     * Deleting a board image only writes a tombstone, which is what keeps the
     * delete cheap; the bytes go when the file is compacted. Past the threshold
     * the panel says so and offers to do it.
     */
    reclaimable?: number;
}

/**
 * The file-target actions, wired to the dialogs they need.
 *
 * Deliberately not gated on the user's role: binding writes a copy *out*, it
 * does not modify the project, so a viewer keeps it like every other
 * non-destructive action.
 */
export function useFileActions(projectId: string | null, projectTitle: string): FileActions {
    const userCtx = useContext(UserContext);
    const status = useFileBindingStatus(projectId);
    const isSupported = isFileBindingSupported();

    /**
     * Take a path and bind to it, stopping to ask first where binding would cost
     * something the OS's own "replace?" prompt does not mention.
     */
    const bindWithConfirmation = useCallback(
        async (path: string) => {
            if (!projectId) return;

            const refusal: BindRefusal | null = await checkBindTarget(projectId, path);
            if (!refusal) {
                await bindProject(projectId, path);
                return;
            }

            // Two of the three are genuine refusals: another project in this
            // library already writes here (two writers, one file, guaranteed to
            // clobber each other), or the OS will not let us write at all.
            if (refusal.kind !== "replaces-foreign-file") {
                confirmFileBindPopup(userCtx, refusal, null);
                return;
            }

            // The third is the user's call — but it destroys another project's
            // file, which "replace?" does not convey.
            confirmFileBindPopup(userCtx, refusal, () => {
                void bindProject(projectId, path);
            });
        },
        [projectId, userCtx],
    );

    const saveAs = useCallback(async () => {
        if (!projectId || !isSupported) return;
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
            defaultPath: `${projectTitle || "Untitled"}.scenarly`,
            filters: [SCENARLY_FILE_FILTER],
        });
        if (path) await bindWithConfirmation(path);
    }, [projectId, isSupported, projectTitle, bindWithConfirmation]);

    const save = useCallback(async () => {
        if (!projectId || !isSupported) return;

        // Read when invoked, not captured: closing over `status` would give this
        // callback a new identity on every status change — twice per autosave,
        // "saving" then "saved" — and EditorPanel keys its global keybinds off
        // it, so the editor would tear down and rebind them on the save cadence.
        const current = getFileBindingStatus(projectId);

        // Bound: just write. Re-opening a save dialog every time would make ⌘S
        // hostile in exactly the workflow this feature is for.
        //
        // The write still happens — the keystroke should never be a no-op — but
        // it is the *reason* for pressing it that needs answering, so say that
        // the file keeps itself current. Only where that is true: `missing` and
        // `error` mean autosave is stopped, and the save panel is already saying
        // so; promising it here would be a lie told over a real problem.
        if (current.state !== "unbound") {
            if (current.state === "saved" || current.state === "saving") {
                autoSavePopup(userCtx, current.path);
            }
            await flushNow(projectId);
            markManualSave(projectId);
            return;
        }

        // Unbound: ⌘S has no obvious meaning when everything is already saved, so
        // say so plainly before offering the thing it *can* do.
        saveToFilePopup(userCtx, () => void saveAs());
    }, [projectId, isSupported, userCtx, saveAs]);

    const locate = useCallback(async () => {
        if (!projectId || !isSupported) return;
        const { open } = await import("@tauri-apps/plugin-dialog");
        const path = await open({ multiple: false, directory: false, filters: [SCENARLY_FILE_FILTER] });
        if (typeof path === "string") await bindWithConfirmation(path);
    }, [projectId, isSupported, bindWithConfirmation]);

    const reveal = useCallback(async () => {
        if (status.state === "unbound" || status.state === "saving") return;
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
        await revealItemInDir(status.path);
    }, [status]);

    const stopSaving = useCallback(async () => {
        if (!projectId) return;
        await unbindProject(projectId);
    }, [projectId]);

    const compact = useCallback(async () => {
        if (!projectId) return;
        await compactFileBinding(projectId);
    }, [projectId]);

    // Only while the file is actually up to date: mid-save or mid-problem, how
    // much of it is reclaimable is neither known nor the thing to raise.
    const free = status.state === "saved" ? status.freeFraction : undefined;
    const reclaimable = free !== undefined && free >= SUGGEST_COMPACT_FRACTION ? free : undefined;

    return useMemo(
        () => ({ status, isSupported, save, saveAs, locate, reveal, stopSaving, compact, reclaimable }),
        [status, isSupported, save, saveAs, locate, reveal, stopSaving, compact, reclaimable],
    );
}
