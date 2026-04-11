import { Extension, Editor } from "@tiptap/core";
import { DEFAULT_KEYBINDS, DefaultKeyBind, KeybindId, toTipTapKeybind } from "../../utils/keybinds";

interface KeybindOptions {
    userKeybinds: Record<string, string>;
    // Update the signature to accept the Editor instance
    onAction: (id: KeybindId, editor: Editor) => void;
}

export const KeybindsExtension = Extension.create<KeybindOptions>({
    name: "userKeybinds",

    priority: 1000,

    addOptions() {
        return {
            userKeybinds: {},
            onAction: () => {}, // Default empty function
        };
    },

    addKeyboardShortcuts() {
        const shortcuts: Record<string, () => boolean> = {};
        const userMap = this.options.userKeybinds;

        (Object.keys(DEFAULT_KEYBINDS) as Array<KeybindId>).forEach((id) => {
            const def = DEFAULT_KEYBINDS[id];
            if (def.scope === "global") return;

            const combo = userMap[id] || def.defaultCombo;
            if (!combo) return;

            shortcuts[toTipTapKeybind(combo)] = () => {
                if (this.options.onAction) {
                    this.options.onAction(id, this.editor);
                }
                return true;
            };
        });

        return shortcuts;
    },
});
