export const prettyPrintKeybind = (keybind: string): string => {
    const isMac =
        typeof navigator !== "undefined"
            ? /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
            : false;

    let pretty = keybind;
    pretty = pretty.replaceAll("$mod", isMac ? "⌘" : "Ctrl");
    pretty = pretty.replaceAll("alt", isMac ? "⌥" : "Alt");
    pretty = pretty.replaceAll("shift", isMac ? "⇧" : "Shift");
    pretty = pretty.replaceAll("space", "Space");

    return pretty;
};

export type DefaultKeyBind = { label: string; defaultCombo: string; description: string };
export type DefaultKeybindsMap = Record<string, DefaultKeyBind>;
export type UserKeybindsMap = Record<string, string>; // id -> "ctrl+s" style

export const DEFAULT_KEYBINDS: DefaultKeybindsMap = {
    screenplay_scene: { label: "Toggle Scene", defaultCombo: "alt+s", description: "Toggle scene heading in editor" },
    screenplay_action: { label: "Toggle Action", defaultCombo: "$mod+2", description: "Toggle action block in editor" },
    screenplay_character: { label: "Toggle Character", defaultCombo: "$mod+3", description: "Toggle character block in editor" },
    screenplay_dialogue: { label: "Toggle Dialogue", defaultCombo: "$mod+4", description: "Toggle dialogue block in editor" },
    screenplay_parenthetical: { label: "Toggle Parenthetical", defaultCombo: "$mod+5", description: "Toggle parenthetical in editor" },
    screenplay_transition: { label: "Toggle Transition", defaultCombo: "$mod+6", description: "Toggle transition in editor" },
    screenplay_section: { label: "Toggle Section", defaultCombo: "$mod+7", description: "Toggle section in editor" },
    screenplay_note: { label: "Toggle Note", defaultCombo: "$mod+8", description: "Toggle note in editor" },
};