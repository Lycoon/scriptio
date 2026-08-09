"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";

// A blur is acted on this late so that an editor mutation which blurs and
// immediately re-focuses within a tick (e.g. a mark toggle) doesn't register.
const BLUR_SETTLE_MS = 150;

/**
 * Whether an editor's contenteditable actually holds focus.
 *
 * Not the same question as "is the keyboard up": opening the screenplay search
 * focuses a plain <input> with a keyboard of its own, and ProjectContext's
 * `focusedEditorType` is never cleared on blur, so chrome keyed off either of
 * those alone will follow the wrong field.
 *
 * Subscribed to as an external store rather than mirrored into state by an
 * effect, because the editor may already hold focus by the time we subscribe — a
 * swap between the shelf draft and a tree document lands on one that is focused
 * already, its focus event long gone — so the flag has to be seeded from
 * `isFocused`, and a seeding setState in an effect body is a cascading render on
 * every editor swap (what react-hooks/set-state-in-effect flags).
 *
 * Latched in a ref rather than read straight off `editor.isFocused` because of
 * the settle delay above: a real blur (tapping the search field, dismissing the
 * keyboard) stays blurred past the window and only then reads as false. Since
 * getSnapshot has to be pure and synchronous, that delay lives in the
 * subscription, which latches the settled value and notifies.
 */
export const useEditorFocused = (editor: Editor | null): boolean => {
    const focusedCache = useRef(false);

    return useSyncExternalStore(
        useCallback(
            (callback: () => void) => {
                // Nothing to track, and nothing to reset: a consumer needs an
                // editor to show at all, and re-subscribing seeds from the new one.
                if (!editor) return () => {};
                let blurTimer: ReturnType<typeof setTimeout> | null = null;
                const settle = (focused: boolean) => {
                    if (focusedCache.current === focused) return;
                    focusedCache.current = focused;
                    callback();
                };
                const onFocus = () => {
                    if (blurTimer) clearTimeout(blurTimer);
                    settle(true);
                };
                const onBlur = () => {
                    if (blurTimer) clearTimeout(blurTimer);
                    blurTimer = setTimeout(() => settle(false), BLUR_SETTLE_MS);
                };
                editor.on("focus", onFocus);
                editor.on("blur", onBlur);
                settle(editor.isFocused);
                return () => {
                    if (blurTimer) clearTimeout(blurTimer);
                    editor.off("focus", onFocus);
                    editor.off("blur", onBlur);
                };
            },
            [editor],
        ),
        () => focusedCache.current,
        () => false,
    );
};
