import * as Y from "yjs";
import type { AnyExtension } from "@tiptap/core";
import { MAIN_SCREENPLAY_REF, ProjectState } from "@src/lib/project/project-state";
import type { Comment } from "@src/lib/utils/types";
import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { TITLEPAGE_BASE_EXTENSIONS } from "@src/lib/titlepage/editor";

export type PaginationMode = "screenplay" | "titlepage";

/**
 * DOM attributes applied to every editor's ProseMirror contenteditable element.
 *
 * `autocorrect: "on"` maps to iOS `UITextInputTraits.autocorrectionType = .yes`
 * in the WKWebView, giving writers the same automatic typo correction they get
 * in every other editor on the platform. This was previously "off" to suppress
 * the native QuickType bar, but that trait is all-or-nothing: turning off the
 * bar also turns off correction itself. The bar is the accepted cost — it is
 * included in the visual-viewport inset, so MobileFormatToolbar rides above it
 * rather than being overlapped (see useKeyboardInset).
 *
 * `writingsuggestions: "false"` disables Apple Intelligence inline writing
 * suggestions on newer iOS; that is a distinct trait from autocorrection and
 * does not affect it. `spellcheck: "false"` turns off the browser's native
 * red-squiggle spellcheck — we ship our own spellcheck engine (see
 * SpellcheckContext), so the native one is redundant and its long-press menu
 * adds more unwanted Apple UI. Spell checking and autocorrection are separate
 * `UITextInputTraits`, so suppressing the squiggles keeps correction working.
 * Autocapitalize is intentionally left at the default so sentence-case
 * capitalization still works while typing.
 */
export const EDITOR_INPUT_ATTRIBUTES: Record<string, string> = {
    autocorrect: "on",
    autocomplete: "off",
    spellcheck: "false",
    writingsuggestions: "false",
};

export interface DocumentEditorFeatures {
    /** Whether comments are enabled (node-anchored comments + margin gutter). */
    comments: boolean;
    /** Whether right-click "Shelve" actions are available (always false until shelf phase). */
    shelving: boolean;
    /** Character name highlights in the editor. */
    characterHighlights: boolean;
    /** Search term highlights. */
    searchHighlights: boolean;
    /** Scene color bookmark decorations. */
    sceneBookmarks: boolean;
    /** Production-mode scene labels + OMITTED placeholders. */
    sceneLocking: boolean;
    /** Production revisions: per-line change stamping + gutter stripe + margin asterisks. */
    revisions: boolean;
    /** Prevent duplicate data-ids on paste. */
    nodeIdDedup: boolean;
    /** Character / location autocomplete menus. */
    suggestions: boolean;
    /** CONT'D / MORE orphan prevention. */
    orphanPrevention: boolean;
    /** User-configurable keybind actions. */
    keybinds: boolean;
    /** Fountain auto-format extension. */
    fountain: boolean;
    /** CONT'D extension. */
    contd: boolean;
    /** Inline spellcheck decorations. */
    spellcheck: boolean;
    /** Which pagination header/footer style to apply. */
    paginationMode: PaginationMode;
}

export interface DocumentEditorConfig {
    /** Logical type for conditional behaviour in the hook/panel. */
    type: "screenplay" | "title";
    /**
     * Identifier of the document this editor edits, used to attribute scenes
     * sent to the Outline. `MAIN_SCREENPLAY_REF` for the main screenplay, the
     * document-tree node id for editor documents, `undefined` otherwise (drafts,
     * title page) — those cannot send scenes to the Outline.
     */
    documentId?: string;
    /** Base Tiptap extensions (defines the ProseMirror schema). */
    baseExtensions: AnyExtension[];
    /**
     * Returns the Y.XmlFragment that Collaboration binds to.
     * Evaluated lazily so configs can be module-level constants.
     */
    getFragment: (projectState: ProjectState) => Y.XmlFragment;
    /**
     * Returns the Y.Map for per-document comments, or null if comments are disabled.
     * Evaluated lazily for the same reason as getFragment.
     */
    getCommentsMap: (projectState: ProjectState) => Y.Map<Comment> | null;
    features: DocumentEditorFeatures;
}

// ---- Preset configs ----

export const SCREENPLAY_EDITOR_CONFIG: DocumentEditorConfig = {
    type: "screenplay",
    documentId: MAIN_SCREENPLAY_REF,
    baseExtensions: BASE_EXTENSIONS,
    getFragment: (s) => s.screenplayFragment(),
    getCommentsMap: (s) => s.comments(),
    features: {
        comments: true,
        shelving: true,
        characterHighlights: true,
        searchHighlights: true,
        sceneBookmarks: true,
        sceneLocking: true,
        revisions: true,
        nodeIdDedup: true,
        suggestions: true,
        orphanPrevention: true,
        keybinds: true,
        fountain: true,
        contd: true,
        spellcheck: true,
        paginationMode: "screenplay",
    },
};

export const TITLEPAGE_EDITOR_CONFIG: DocumentEditorConfig = {
    type: "title",
    baseExtensions: TITLEPAGE_BASE_EXTENSIONS,
    getFragment: (s) => s.titlepageFragment(),
    getCommentsMap: () => null,
    features: {
        comments: false,
        shelving: false,
        characterHighlights: false,
        searchHighlights: false,
        sceneBookmarks: false,
        sceneLocking: false,
        revisions: false,
        nodeIdDedup: false,
        suggestions: false,
        orphanPrevention: false,
        keybinds: false,
        fountain: false,
        contd: false,
        spellcheck: false,
        paginationMode: "titlepage",
    },
};
