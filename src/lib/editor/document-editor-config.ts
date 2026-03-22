import * as Y from "yjs";
import type { AnyExtension } from "@tiptap/core";
import { ProjectState } from "@src/lib/project/project-state";
import { BASE_EXTENSIONS } from "@src/lib/screenplay/editor";
import { TITLEPAGE_BASE_EXTENSIONS } from "@src/lib/titlepage/editor";

export type PaginationMode = "screenplay" | "titlepage";

export interface DocumentEditorFeatures {
    /** Whether comments are enabled (CommentMark, CommentCards). */
    comments: boolean;
    /** Whether right-click "Shelve" actions are available (always false until shelf phase). */
    shelving: boolean;
    /** Character name highlights in the editor. */
    characterHighlights: boolean;
    /** Search term highlights. */
    searchHighlights: boolean;
    /** Scene color bookmark decorations. */
    sceneBookmarks: boolean;
    /** Prevent duplicate scene-ids on paste. */
    sceneIdDedup: boolean;
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
    getCommentsMap: (projectState: ProjectState) => Y.Map<any> | null;
    features: DocumentEditorFeatures;
}

// ---- Preset configs ----

export const SCREENPLAY_EDITOR_CONFIG: DocumentEditorConfig = {
    type: "screenplay",
    baseExtensions: BASE_EXTENSIONS,  // CommentMark added dynamically by hook when features.comments=true
    getFragment: (s) => s.screenplayFragment(),
    getCommentsMap: (s) => s.comments(),
    features: {
        comments: true,
        shelving: false,
        characterHighlights: true,
        searchHighlights: true,
        sceneBookmarks: true,
        sceneIdDedup: true,
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
        sceneIdDedup: false,
        suggestions: false,
        orphanPrevention: false,
        keybinds: false,
        fountain: false,
        contd: false,
        spellcheck: false,
        paginationMode: "titlepage",
    },
};
