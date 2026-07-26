// ------------------------------ //
//             WEBSITE            //
// ------------------------------ //

export const ALL_PAGES = ["index", "screenplay", "board", "statistics", "privacy", "contact"] as const;
export type Page = (typeof ALL_PAGES)[number];

export const isPage = (value: string): value is Page => {
    return ALL_PAGES.includes(value as Page);
};

// ------------------------------ //
//            PANELS              //
// ------------------------------ //

export const PANEL_TYPES = ["screenplay", "board", "statistics", "title"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

// ------------------------------ //
//            PROJECT             //
// ------------------------------ //

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

export enum SaveMode {
    Local = 1,
    Cloud = 2,
    Both = Local | Cloud,
}

// ------------------------------ //
//            EDITOR              //
// ------------------------------ //

export type PageFormat = "A4" | "LETTER";

/**
 * A format the project can be exported TO, as asked for by the export UI.
 *
 * These are format ids, not file extensions — the adapter owns the extension it
 * writes. The two differ wherever an extension means something else on import:
 * `TEXT` writes a `.txt` file, but a `.txt` file being imported is read as
 * Fountain, so the id has to be distinct. Each adapter declares which id it
 * answers to (see `ProjectAdapter.exportTarget`), so this enum is the single
 * list of what the UI may ask for.
 */
export enum ExportFormat {
    PDF = "pdf",
    FOUNTAIN = "fountain",
    FDX = "fdx",
    TEXT = "text",
    SCRIPTIO = "scriptio",
}

export enum Style {
    None = 0,
    Bold = 1,
    Italic = 2,
    Underline = 4,
}

// String values must match the class names in the /public/scriptio.css file
export enum ScreenplayElement {
    Scene = "scene",
    Action = "action",
    Character = "character",
    Dialogue = "dialogue",
    Parenthetical = "parenthetical",
    Transition = "transition",
    Section = "section",
    Note = "note",
    None = "none",
    DualDialogue = "dual_dialogue",
}

// Title page format marks - applied as indivisible inline marks on text
export enum TitlePageElement {
    Title = "tp-title",
    Author = "tp-author",
    Date = "tp-date",
    None = "none",
}
