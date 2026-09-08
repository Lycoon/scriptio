import { Extension, Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Command } from "@tiptap/pm/state";
import { keydownHandler } from "@tiptap/pm/keymap";
import { DEFAULT_KEYBINDS, KeybindId, toTipTapKeybind } from "../../utils/keybinds";

interface KeybindOptions {
    /**
     * The user's overrides, read at keydown rather than captured.
     *
     * An editor is built once and lives for the session, but the bindings do
     * not: for a signed-in user they arrive with the remote settings, some
     * moments after the editor exists, and they change again whenever the
     * preferences panel saves. Configured as a value they would be whatever they
     * happened to be at construction — which for the main screenplay is usually
     * nothing at all — and only a remount would pick the real ones up.
     */
    getUserKeybinds: () => Record<string, string>;
    /** Runs the action, and reports whether this document could perform it. */
    onAction: (id: KeybindId, editor: Editor) => boolean;
}

/**
 * Binds the user-configurable actions in whatever editor it is loaded into.
 *
 * Loaded everywhere, which is why nothing here assumes a screenplay: an action
 * the current document has no schema for reports false and the key falls through
 * (⌘2 does nothing on the title page rather than being eaten by it), while the
 * marks all three documents share work the same in each.
 */
export const KeybindsExtension = Extension.create<KeybindOptions>({
    name: "userKeybinds",

    priority: 1000,

    addOptions() {
        return {
            getUserKeybinds: () => ({}),
            onAction: () => false,
        };
    },

    addProseMirrorPlugins() {
        // Built from the current overrides and rebuilt when they change, so the
        // common keystroke costs one string compare rather than a rebuild.
        let signature: string | null = null;
        let handler = keydownHandler({});

        const bindingsFor = (userMap: Record<string, string>) => {
            const bindings: Record<string, Command> = {};

            // This extension outranks the marks and nodes it competes with
            // (priority 1000 above their default 100), so its plugin is consulted
            // first and, by returning true, stops the built-in behind it.
            (Object.keys(DEFAULT_KEYBINDS) as Array<KeybindId>).forEach((id) => {
                const def = DEFAULT_KEYBINDS[id];
                if (def.scope === "global") return;

                const combo = userMap[id] || def.defaultCombo;
                if (!combo) return;

                bindings[toTipTapKeybind(combo)] = () => this.options.onAction(id, this.editor);
            });

            // Second pass, so a rebind never loses to a combo claimed above: an
            // action that took a shortcut over from another extension has to hold
            // that shortcut down once it moves off it. Bold keeps its own ⌘B
            // whatever the user picks, so ⌘B is swallowed here instead — dead,
            // which is what "rebound" has to mean, rather than a second way to
            // bold.
            (Object.keys(DEFAULT_KEYBINDS) as Array<KeybindId>).forEach((id) => {
                const def = DEFAULT_KEYBINDS[id];
                if (def.scope === "global" || !def.overrides) return;
                if ((userMap[id] || def.defaultCombo) === def.defaultCombo) return;

                def.overrides.forEach((key) => {
                    if (!(key in bindings)) bindings[key] = () => true;
                });
            });

            return bindings;
        };

        return [
            new Plugin({
                props: {
                    handleKeyDown: (view, event) => {
                        const userMap = this.options.getUserKeybinds() || {};
                        const next = JSON.stringify(userMap);
                        if (next !== signature) {
                            signature = next;
                            handler = keydownHandler(bindingsFor(userMap));
                        }
                        return handler(view, event);
                    },
                },
            }),
        ];
    },
});
