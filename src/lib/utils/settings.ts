import { applyElement } from "../editor/editor";
import { ScreenplayElement } from "./enums";
import { Editor } from "@tiptap/react";

export const prettyPrintKeybind = (keybind: string): string => {
    const isMac = typeof navigator !== "undefined" ? /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) : false;

    let pretty = keybind;
    pretty = pretty.replaceAll("$mod", isMac ? "⌘" : "Ctrl");
    pretty = pretty.replaceAll("alt", "Alt");
    pretty = pretty.replaceAll("shift", "Shift");
    pretty = pretty.replaceAll("space", "Space");

    return pretty;
};

export const toTipTapKeybind = (keybind: string): string => {
    let tipTapKeybind = keybind;
    tipTapKeybind = tipTapKeybind.replaceAll("+", "-");
    tipTapKeybind = tipTapKeybind.replaceAll("$mod", "Mod");
    tipTapKeybind = tipTapKeybind.replaceAll("alt", "Alt");
    tipTapKeybind = tipTapKeybind.replaceAll("shift", "Shift");
    tipTapKeybind = tipTapKeybind.replaceAll("space", "Space");

    return tipTapKeybind;
};

export type KeybindScope = "global" | "editor";
export type DefaultKeyBind = { label: string; defaultCombo: string; description: string; scope: KeybindScope };
export type DefaultKeybindsMap = Record<string, DefaultKeyBind>;
export type UserKeybindsMap = Record<string, string>; // id -> "ctrl+s" style

export const DEFAULT_KEYBINDS: DefaultKeybindsMap = {
    // Global Actions (Work inside and outside editor)
    save_project: {
        label: "Save Project",
        defaultCombo: "$mod+s",
        description: "Save the current project",
        scope: "global",
    },
    toggle_focus_mode: {
        label: "Focus Mode",
        defaultCombo: "$mod+Shift+u",
        description: "Toggle UI focus mode",
        scope: "global",
    },

    // Editor Actions (Only work when editor is focused)
    screenplay_scene: {
        label: "Toggle Scene",
        defaultCombo: "alt+s",
        description: "Toggle scene heading",
        scope: "editor",
    },
    screenplay_action: {
        label: "Toggle Action",
        defaultCombo: "$mod+2",
        description: "Toggle action block",
        scope: "editor",
    },
    screenplay_character: {
        label: "Toggle Character",
        defaultCombo: "$mod+3",
        description: "Toggle character block",
        scope: "editor",
    },
    screenplay_dialogue: {
        label: "Toggle Dialogue",
        defaultCombo: "$mod+4",
        description: "Toggle dialogue block",
        scope: "editor",
    },
    screenplay_parenthetical: {
        label: "Toggle Parenthetical",
        defaultCombo: "$mod+5",
        description: "Toggle parenthetical",
        scope: "editor",
    },
    screenplay_transition: {
        label: "Toggle Transition",
        defaultCombo: "$mod+6",
        description: "Toggle transition",
        scope: "editor",
    },
    screenplay_section: {
        label: "Toggle Section",
        defaultCombo: "$mod+7",
        description: "Toggle section",
        scope: "editor",
    },
    screenplay_note: {
        label: "Toggle Note",
        defaultCombo: "$mod+8",
        description: "Toggle note",
        scope: "editor",
    },
};

type ActionContext = {
    editor?: Editor | null;
    toggleFocusMode?: () => void; // Example global UI action
    saveProject?: () => void; // Example global UI action
};

export const executeAction = (actionId: string, context: ActionContext): boolean => {
    const { editor, toggleFocusMode, saveProject } = context;
    console.log("actionId: ", actionId);

    switch (actionId) {
        // Global Actions
        case "save_project":
            if (saveProject) saveProject();
            return true;
        case "toggle_focus_mode":
            if (toggleFocusMode) toggleFocusMode();
            return true;

        // Editor Actions
        case "screenplay_scene":
            if (editor) {
                applyElement(editor, ScreenplayElement.Scene);
                return true;
            }
            break;
        case "screenplay_action":
            if (editor) {
                applyElement(editor, ScreenplayElement.Action);
                return true;
            }
            break;
        case "screenplay_character":
            if (editor) {
                applyElement(editor, ScreenplayElement.Character);
                return true;
            }
            break;
        case "screenplay_dialogue":
            if (editor) {
                applyElement(editor, ScreenplayElement.Dialogue);
                return true;
            }
            break;
        case "screenplay_parenthetical":
            if (editor) {
                applyElement(editor, ScreenplayElement.Parenthetical);
                return true;
            }
            break;
        case "screenplay_transition":
            if (editor) {
                applyElement(editor, ScreenplayElement.Transition);
                return true;
            }
            break;
        case "screenplay_section":
            if (editor) {
                applyElement(editor, ScreenplayElement.Section);
                return true;
            }
            break;
        case "screenplay_note":
            if (editor) {
                applyElement(editor, ScreenplayElement.Note);
                return true;
            }
            break;
    }
    return false;
};
