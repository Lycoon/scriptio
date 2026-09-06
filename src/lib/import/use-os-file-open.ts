"use client";

import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { isFileBindingSupported } from "@src/lib/persistence/file-binding";
import { offerScriptioOpenFromPath } from "./scriptio-file-open";

/**
 * Route `.scriptio` files the OS hands us into the open flow.
 *
 * Two arrival paths, both ending here:
 *  · **Cold launch** — the path is in `argv` (Windows/Linux) or an Apple Event
 *    (macOS), and reaches Rust long before this component exists. Rust queues
 *    it; we drain that queue once on mount. Listening alone would miss it.
 *  · **Already running** — the same Rust code emits an event, which the second
 *    half of this hook picks up. On Windows and Linux that only works because a
 *    single-instance guard forwards the second process's argv instead of letting
 *    it start a rival session over the same project.
 *
 * Desktop only, and mounted once at the projects layout so it is live on the
 * listing page as well as inside a project.
 */
export function useOsFileOpen(): void {
    useEffect(() => {
        if (!isTauri() || !isFileBindingSupported()) return;

        let cancelled = false;
        let unlisten: (() => void) | null = null;

        const handle = (path: unknown) => {
            if (cancelled || typeof path !== "string" || !path) return;
            void offerScriptioOpenFromPath(path).catch((error) =>
                console.error("[Scriptio] Could not open the file the system sent:", error),
            );
        };

        (async () => {
            try {
                const [{ invoke }, { listen }] = await Promise.all([
                    import("@tauri-apps/api/core"),
                    import("@tauri-apps/api/event"),
                ]);

                const stop = await listen<string>("scriptio://open-file", (event) => handle(event.payload));
                if (cancelled) {
                    stop();
                    return;
                }
                unlisten = stop;

                // Drained after the listener is attached, so a file arriving in
                // the gap is caught by one or the other rather than neither.
                const queued = await invoke<string[]>("take_pending_open_files");
                // One dialog at a time; a queue of several would stack modals.
                // The rest stay in ours to be re-offered — rare enough (dropping
                // several files on the dock icon at once) to not warrant a queue
                // UI, and the user can simply open them again.
                if (queued.length > 0) handle(queued[0]);
            } catch (error) {
                console.warn("[Scriptio] File-open integration unavailable:", error);
            }
        })();

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, []);
}
