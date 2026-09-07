"use client";

import { useCallback, useContext } from "react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useFileActions } from "./use-file-binding";

/**
 * What ⌘S does, for the whole project rather than for one panel.
 *
 * ⌘S means "save to a file", and nothing else. Everything else is already saved
 * — continuously, to this device and to the cloud — so there is no version of
 * this shortcut that makes the project safer. What it can do is give the user a
 * copy they own: on desktop that is a binding Scriptio then keeps current (or,
 * unbound, the offer to make one), and where no binding is possible it is a
 * plain export of a copy, the same thing the Export panel writes.
 *
 * It lives here, not in the screenplay panel, because the shortcut is not the
 * screenplay's: pressing it while reading the title page or a board has to mean
 * the same thing.
 */
export function useSaveProject(): () => Promise<void> {
    const { repository, projectId, projectTitle } = useContext(ProjectContext);
    const fileActions = useFileActions(projectId, projectTitle);

    return useCallback(async () => {
        if (fileActions.isSupported) {
            await fileActions.save();
            return;
        }

        const ydoc = repository?.getState();
        if (!ydoc) return;
        const { ScriptioAdapter } = await import("@src/lib/adapters/scriptio/scriptio-adapter");
        await new ScriptioAdapter().export(ydoc, {
            title: projectTitle || "Untitled",
            author: ydoc.metadata().get("author") ?? "",
            includeNotes: true,
            readable: false,
            projectId,
        });
    }, [fileActions, repository, projectTitle, projectId]);
}
