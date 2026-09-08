import { applyElement, applyMarkToggle } from "../screenplay/editor";
import { ScreenplayElement, Style } from "./enums";
import { Editor } from "@tiptap/react";

/**
 * The physical key a combo names, when it names one: "KeyT" → "T", "Digit1" → "1".
 *
 * A combo's last part is either a character ("s") or a `KeyboardEvent.code`
 * ("KeyS"), and the code form is what makes a combo survive a keyboard.
 * `event.key` is what the layout and the modifiers *produced*: on macOS Option+F
 * is "ƒ" and Option+N is "Dead", and on any layout Shift+1 is "!". tinykeys
 * matches a global combo against `event.key` or `event.code` and nothing else,
 * so anything with Alt or Shift in it has to be recorded as a code or it simply
 * never fires — silently, and only on some machines.
 */
const physicalKey = (part: string): string | undefined => {
    const match = /^key([a-z])$/i.exec(part) ?? /^digit([0-9])$/i.exec(part);
    return match ? match[1].toUpperCase() : undefined;
};

/**
 * Rewrite the parts of a combo, whatever case they were stored in.
 *
 * The modifier names matter beyond spelling too: tinykeys resolves them with
 * `event.getModifierState(name)`, and the DOM only answers to the exact names —
 * "alt" is not "Alt". So combos are written and captured in that casing, and
 * read back case-insensitively for anything recorded before.
 */
const mapCombo = (keybind: string, translate: (token: string) => string | undefined, join: string): string =>
    keybind
        .split("+")
        .map((part) => translate(part.toLowerCase()) ?? part)
        .join(join);

export const prettyPrintKeybind = (keybind: string): string => {
    const isMac = typeof navigator !== "undefined" ? /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) : false;

    return mapCombo(
        keybind,
        (token) =>
            ({
                $mod: isMac ? "⌘" : "Ctrl",
                // ⌘ and ⌥ are how the keys are labelled on a Mac keyboard. ⇧ is
                // too, but it draws far smaller than the other two and reads as
                // a speck at this size, so Shift stays a word everywhere.
                alt: isMac ? "⌥" : "Alt",
                shift: "Shift",
                space: "Space",
            })[token] ??
            physicalKey(token) ??
            // A combo's key can also be stored as the character it types
            // ("$mod+s"), which should print like the code form does. Anything
            // longer is a DOM key name — "Enter", "ArrowLeft", "F5" — and keeps
            // the spelling it was stored with.
            (token.length === 1 ? token.toUpperCase() : undefined),
        "+",
    );
};

/**
 * Tiptap/ProseMirror form. Codes go back to their character, which is what
 * prosemirror-keymap matches on — it does its own base-layout lookup through
 * `keyCode`, so the character survives Option there in a way it does not in
 * tinykeys.
 */
export const toTipTapKeybind = (keybind: string): string =>
    mapCombo(
        keybind,
        (token) =>
            ({ $mod: "Mod", alt: "Alt", shift: "Shift", space: "Space" })[token] ??
            physicalKey(token)?.toLowerCase(),
        "-",
    );

export type KeybindId =
    | "save_project"
    | "toggle_focus_mode"
    | "view_split"
    | "view_screenplay"
    | "view_title_page"
    | "view_scene_cards"
    | "view_timeline"
    | "view_left_sidebar"
    | "view_right_sidebar"
    | "style_bold"
    | "style_italic"
    | "style_underline"
    | "screenplay_scene"
    | "screenplay_action"
    | "screenplay_character"
    | "screenplay_dialogue"
    | "screenplay_parenthetical"
    | "screenplay_transition"
    | "screenplay_section"
    | "screenplay_note";

export type KeybindScope = "global" | "editor";
/** Which section of the keybind settings an action is listed under. */
export type KeybindGroup = "global" | "view" | "screenplay" | "style";
export type DefaultKeyBind = {
    defaultCombo: string;
    scope: KeybindScope;
    group: KeybindGroup;
    /**
     * Tiptap shortcuts owned by another extension that this action replaces.
     *
     * Bold and Italic bind ⌘B / ⌘I themselves, from inside the mark extension —
     * rebinding the action here does not unbind those, so without this the old
     * shortcut would quietly keep working alongside the new one. Listed as
     * Tiptap keys (both cases, the way the mark registers them) and swallowed by
     * KeybindsExtension once the action is no longer on its default combo.
     */
    overrides?: string[];
};
export type DefaultKeybindsMap = Record<KeybindId, DefaultKeyBind>;
export type UserKeybindsMap = Record<string, string>; // id -> "ctrl+s" style

/**
 * What each shortcut does and what it is bound to out of the box.
 *
 * The human-readable name lives in the message catalogues, under
 * `keybinds.labels.<id>`, not here: this map is imported by the editor and the
 * global key handler, neither of which has a locale, and a label carried in the
 * data would have to be English everywhere it was shown.
 */
export const DEFAULT_KEYBINDS: DefaultKeybindsMap = {
    // Global Actions (Work inside and outside editor)
    save_project: {
        defaultCombo: "$mod+s",
        scope: "global",
        group: "global",
    },
    toggle_focus_mode: {
        defaultCombo: "$mod+Shift+u",
        scope: "global",
        group: "global",
    },

    // What is on screen. Global, because none of it is about the document under
    // the caret — a shortcut for the Timeline has to work from the title page
    // and from a board, not only from the screenplay.
    //
    // Alt+digit picks a view the way tabs do; Alt+letter toggles a piece of
    // furniture. Alt rather than ⌘ throughout: ⌘+digit is already the element
    // set, and these have to stay clear of it.
    //
    // Written as codes (see `physicalKey`), which is the only form that holds
    // under Option on macOS — Alt+F reports "ƒ" and Alt+N reports "Dead", so
    // "Alt+f" would match on Windows and quietly do nothing on a Mac.
    view_screenplay: {
        defaultCombo: "Alt+Digit1",
        scope: "global",
        group: "view",
    },
    view_title_page: {
        defaultCombo: "Alt+Digit2",
        scope: "global",
        group: "view",
    },
    view_scene_cards: {
        defaultCombo: "Alt+Digit3",
        scope: "global",
        group: "view",
    },
    view_split: {
        // Not Alt+S: that is the scene element. Sharing a physical key with it
        // is fine — the modifier sets differ, and both handlers demand an exact
        // match — but the two must not be one Shift apart by accident, so this
        // one is deliberate rather than incidental.
        defaultCombo: "Alt+Shift+KeyS",
        scope: "global",
        group: "view",
    },
    view_timeline: {
        defaultCombo: "Alt+KeyT",
        scope: "global",
        group: "view",
    },
    // L and R for left and right — and, as it happens, the two letters here that
    // are not an Option dead key on macOS. Option+N is how a Mac types ñ; a
    // default that swallowed it would break writing Spanish in the app.
    view_left_sidebar: {
        defaultCombo: "Alt+KeyL",
        scope: "global",
        group: "view",
    },
    view_right_sidebar: {
        defaultCombo: "Alt+KeyR",
        scope: "global",
        group: "view",
    },

    // Text styling (editor-scoped, and taken over from Tiptap's own marks)
    style_bold: {
        defaultCombo: "$mod+b",
        scope: "editor",
        group: "style",
        overrides: ["Mod-b", "Mod-B"],
    },
    style_italic: {
        defaultCombo: "$mod+i",
        scope: "editor",
        group: "style",
        overrides: ["Mod-i", "Mod-I"],
    },
    style_underline: {
        defaultCombo: "$mod+u",
        scope: "editor",
        group: "style",
        overrides: ["Mod-u", "Mod-U"],
    },

    // Editor Actions (Only work when editor is focused)
    screenplay_scene: {
        defaultCombo: "Alt+s",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_action: {
        defaultCombo: "$mod+2",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_character: {
        defaultCombo: "$mod+3",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_dialogue: {
        defaultCombo: "$mod+4",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_parenthetical: {
        defaultCombo: "$mod+5",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_transition: {
        defaultCombo: "$mod+6",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_section: {
        defaultCombo: "$mod+7",
        scope: "editor",
        group: "screenplay",
    },
    screenplay_note: {
        defaultCombo: "$mod+8",
        scope: "editor",
        group: "screenplay",
    },
};

type ActionContext = {
    editor?: Editor | null;
    toggleFocusMode?: () => void; // Example global UI action
    saveProject?: () => void; // Example global UI action
    /** The workspace's own view operations, wired by the project shell. */
    view?: ViewActions;
};

/**
 * What the view shortcuts operate on.
 *
 * Declared here as plain functions rather than reaching for ViewContext: this
 * module is imported by the editor extensions, and it has no business knowing
 * that the workspace's view state is a React context.
 */
export type ViewActions = {
    /** Split the view in two, or close the second side. */
    toggleSplit: () => void;
    showScreenplay: () => void;
    showTitlePage: () => void;
    /** Swap the screenplay between the script and the index-card grid. */
    toggleSceneCards: () => void;
    toggleTimeline: () => void;
    toggleLeftSidebar: () => void;
    toggleRightSidebar: () => void;
};

/**
 * Run one action, reporting whether it could.
 *
 * Every editor in the app binds these, and they do not share a schema: the title
 * page has the three marks but none of the screenplay nodes, and a document
 * fragment has no title-page nodes. So an action the document at hand cannot
 * perform answers false rather than throwing, and the keystroke falls through to
 * whatever would have handled it instead of being swallowed.
 */
export const executeKeybindAction = (keybindId: KeybindId, context: ActionContext): boolean => {
    const { editor, toggleFocusMode, saveProject, view } = context;

    // The view actions come from the project shell, so they are there whenever a
    // project is open and absent everywhere else.
    const runView = (run: (actions: ViewActions) => void): boolean => {
        if (!view) return false;
        run(view);
        return true;
    };

    const setElement = (element: ScreenplayElement): boolean => {
        if (!editor || !editor.schema.nodes[element]) return false;
        applyElement(editor, element);
        return true;
    };

    // applyMarkToggle is what the toolbars call, so styling goes through one
    // path however it is triggered.
    const toggleStyle = (style: Style, mark: string): boolean => {
        if (!editor || !editor.schema.marks[mark]) return false;
        applyMarkToggle(editor, style);
        return true;
    };

    switch (keybindId) {
        // Global Actions
        case "save_project":
            if (!saveProject) return false;
            saveProject();
            return true;
        case "toggle_focus_mode":
            if (!toggleFocusMode) return false;
            toggleFocusMode();
            return true;

        // View
        case "view_split":
            return runView((v) => v.toggleSplit());
        case "view_screenplay":
            return runView((v) => v.showScreenplay());
        case "view_title_page":
            return runView((v) => v.showTitlePage());
        case "view_scene_cards":
            return runView((v) => v.toggleSceneCards());
        case "view_timeline":
            return runView((v) => v.toggleTimeline());
        case "view_left_sidebar":
            return runView((v) => v.toggleLeftSidebar());
        case "view_right_sidebar":
            return runView((v) => v.toggleRightSidebar());

        // Text styling
        case "style_bold":
            return toggleStyle(Style.Bold, "bold");
        case "style_italic":
            return toggleStyle(Style.Italic, "italic");
        case "style_underline":
            return toggleStyle(Style.Underline, "underline");

        // Editor Actions
        case "screenplay_scene":
            return setElement(ScreenplayElement.Scene);
        case "screenplay_action":
            return setElement(ScreenplayElement.Action);
        case "screenplay_character":
            return setElement(ScreenplayElement.Character);
        case "screenplay_dialogue":
            return setElement(ScreenplayElement.Dialogue);
        case "screenplay_parenthetical":
            return setElement(ScreenplayElement.Parenthetical);
        case "screenplay_transition":
            return setElement(ScreenplayElement.Transition);
        case "screenplay_section":
            return setElement(ScreenplayElement.Section);
        case "screenplay_note":
            return setElement(ScreenplayElement.Note);
    }
};
