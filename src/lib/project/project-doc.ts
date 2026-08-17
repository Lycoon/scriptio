/**
 * Worker-safe Y.Doc subclass for Scriptio projects.
 *
 * This file deliberately avoids React, tiptap, and any prosemirror imports
 * so it can be loaded inside the Cloudflare DurableObject. The browser-only
 * helpers that need ProseMirror conversion (e.g. screenplay()/titlepage()
 * → JSONContent) live as standalone functions in `./project-state.ts`.
 *
 * All non-yjs imports here are `import type` so nothing else is pulled into
 * the worker bundle at runtime.
 */

import * as Y from "yjs";

import type { JSONContent } from "@tiptap/react";
import type { PageFormat } from "../utils/enums";
import type { CharacterItem } from "../screenplay/characters";
import type { LocationItem } from "../screenplay/locations";
import type { PersistentScene } from "../screenplay/scenes";
import type { PersistentPage } from "../screenplay/page-locking";
import type { RevisionBaseEntry, RevisionDisplayMode } from "../screenplay/revisions";
import type { Comment } from "../utils/types";

// -------------------------------- //
//          SHELF TYPES             //
// -------------------------------- //

export type ShelfEntryType = "scene" | "character" | "action";

export type ShelfVersionMeta = {
    id: string;
    title: string;
};

export type ShelfEntry = {
    title: string;
    type: ShelfEntryType;
    versions: ShelfVersionMeta[];
};

// -------------------------------- //
//          METADATA                //
// -------------------------------- //

export type ProjectMetadata = {
    version: number;
    id: string;
    title: string;
    author: string;
    titlepageInitialized?: boolean;
    /** Target feature length in minutes, used to size the Timeline extent. */
    featureLength?: number;
};

// -------------------------------- //
//          LAYOUT                  //
// -------------------------------- //

export type ElementMargin = { left: number; right: number };
export type PageMargin = { top: number; bottom: number; left: number; right: number };

export const DEFAULT_PAGE_MARGINS: PageMargin = {
    top: 1.0,
    bottom: 1.0,
    left: 1.5,
    right: 1.0,
};

export const DEFAULT_ELEMENT_MARGINS: Record<string, ElementMargin> = {
    action: { left: 0, right: 0 },
    scene: { left: 0, right: 0 },
    character: { left: 2.5, right: 0 },
    dialogue: { left: 1.3, right: 1.0 },
    parenthetical: { left: 2.0, right: 2.0 },
    transition: { left: 0, right: 0 },
    section: { left: 0, right: 0 },
};

export type ElementStyle = {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    uppercase?: boolean;
    align?: "left" | "center" | "right";
    startNewPage?: boolean;
};

export const DEFAULT_ELEMENT_STYLES: Record<string, ElementStyle> = {
    action: { align: "left" },
    scene: { bold: true, align: "left", uppercase: true },
    character: { align: "left", uppercase: true },
    dialogue: { align: "left" },
    parenthetical: { align: "left" },
    transition: { align: "right", uppercase: true },
    section: { align: "center", underline: true, startNewPage: true, uppercase: true },
};

export type LayoutData = {
    pageSize: PageFormat;
    pageMargins: PageMargin;
    displaySceneNumbers: boolean;
    sceneHeadingSpacing: number;
    sceneNumberOnRight: boolean;
    contdLabel: string;
    moreLabel: string;
    /** Append `(CONT'D)` to a character cue resuming after an interruption. */
    showContdDialogue: boolean;
    /** Draw `(MORE)` / `(CONT'D)` around dialogue split by a page break. */
    showContdPageBreak: boolean;
    /** Page-header templates (left/middle/right) with `#`/`@`/`*` placeholders. */
    headerLeft: string;
    headerMiddle: string;
    headerRight: string;
    /** Whether the header is also shown on the (otherwise unnumbered) first page. */
    showFirstPageHeader: boolean;
    /** Page-footer templates (left/middle/right) with `#`/`@`/`*` placeholders. */
    footerLeft: string;
    footerMiddle: string;
    footerRight: string;
    /** Whether the footer is also shown on the (otherwise unnumbered) first page. */
    showFirstPageFooter: boolean;
    elementMargins: Record<string, ElementMargin>;
    elementStyles: Record<string, ElementStyle>;
};

// -------------------------------- //
//          PRODUCTION              //
// -------------------------------- //

export type ProductionData = {
    sceneLocking?: boolean;
    /**
     * How provisional scenes inserted under production lock are labeled.
     * - "suffix" (default): scene inserted between 3 and 4 → "3A".
     * - "prefix": scene inserted between 3 and 4 → "A4". Letters decrease
     *   going forward (closest to L_next gets "A").
     * Only affects scenes that are computed/locked AFTER this setting is set;
     * already-locked scenes keep their stored label.
     */
    sceneNumberingStyle?: "suffix" | "prefix";
    /**
     * Uppercase letters to omit from generated scene labels (e.g. "I" and "O"
     * are visually confused with "1" and "0"). Stored explicitly so the user's
     * choice survives — when `undefined`, callers fall back to
     * `DEFAULT_SKIPPED_SCENE_LETTERS`.
     */
    skippedSceneLetters?: string[];
    /**
     * Page-locking master switch. When true, pagination freezes the numbering
     * of each page using anchors stored in the `pages` Y.Map. Pages inserted
     * between locks get suffix-style labels (e.g. "4A"); pages appended after
     * the last lock continue the integer sequence; deletion of a locked page's
     * content leaves an empty page slot in its place.
     */
    pageLocking?: boolean;
    /**
     * Revisions master switch. When true, edits stamp their top-level node with
     * the current revision index, surfacing a right-margin asterisk on that line
     * and a coloured stripe down the gutter of any page that has changed.
     */
    revisionsEnabled?: boolean;
    /**
     * Active revision index — into the shared `REVISION_COLORS` list
     * (0 = White base draft, 1 = Blue, …). New edits are stamped with this
     * value; advancing it never clears existing marks (revisions are
     * cumulative). See `src/lib/screenplay/revisions.ts`.
     */
    currentRevision?: number;
    /**
     * Revision index the `revisionBase` map was captured for. Stamping only takes
     * the baseline-derived path while this equals `currentRevision`; when it is
     * absent or stale (a project that predates the feature, or a revision advanced
     * with no editor open to snapshot it) marks fall back to being stamped from
     * edit events, which is conservative — it can over-mark, never wrongly clear.
     */
    revisionBaseIndex?: number;
    /**
     * How committed revision marks are displayed ("all" | "hidden" | "current").
     * Independent of `revisionsEnabled`, which only gates whether new edits are
     * stamped. See `RevisionDisplayMode` in `src/lib/screenplay/revisions.ts`.
     */
    revisionDisplayMode?: RevisionDisplayMode;
};

/** Letters skipped by default in newly-created projects. */
export const DEFAULT_SKIPPED_SCENE_LETTERS: string[] = ["I", "O"];

/** Letters the user can toggle via Production Settings. */
export const TOGGLEABLE_SCENE_LETTERS: readonly string[] = ["I", "O", "Q", "Z"];

// -------------------------------- //
//          BOARD                   //
// -------------------------------- //

export interface BoardCardData {
    id: string;
    title: string;
    description: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * Card kind. `undefined`/"text" is the default note card; "image" renders a
     * picture resource; "audio" renders a voice note with a play/pause control.
     */
    type?: "text" | "image" | "audio";
    /**
     * For `type: "image"`/`"audio"` cards: the SHA-256 hash of the source bytes,
     * which are stored separately in IndexedDB (decoupled from Yjs). The bytes
     * never live in the document — only this reference does.
     */
    assetId?: string;
}

export interface BoardArrowData {
    id: string;
    fromCardId: string;
    toCardId: string;
}

export type BoardData = {
    cards: string;
    arrows: string;
};

// -------------------------------- //
//        DOCUMENT TREE             //
// -------------------------------- //

/** Kinds of nodes the user can create in the document hierarchy. */
export type DocumentNodeType = "folder" | "editor" | "board";

/**
 * A node in the project's document hierarchy. The tree is stored flat in the
 * `documents` Y.Map keyed by `id`; hierarchy is reconstructed from `parentId`,
 * siblings ordered by ascending `order` (fractional float so moves never
 * rewrite neighbours).
 *
 * - `editor` nodes own a dedicated Y.XmlFragment (`doc_<id>`).
 * - `board` nodes own a dedicated board data map (`board_<id>`), read via
 *   `boardData(id)`. Projects can hold any number of boards.
 * - `folder` nodes just group children.
 */
export type DocumentNode = {
    id: string;
    type: DocumentNodeType;
    title: string;
    parentId: string | null;
    order: number;
    /** Optional accent color (hex) set via the sidebar right-click color picker. */
    color?: string;
};

// -------------------------------- //
//            TIMELINE              //
// -------------------------------- //

/**
 * Kind of source element a timeline clip references. Extensible — board cards
 * will later come in image/voice/link flavours, which become new source kinds
 * without a schema rewrite.
 */
export type TimelineClipSource = "scene" | "card";

/**
 * Sentinel `refDocId` for scenes that live in the project's main screenplay
 * fragment (as opposed to a per-document `editor` fragment).
 */
export const MAIN_SCREENPLAY_REF = "screenplay";

/**
 * A horizontal lane in the project's Timeline. Layers stack top-to-bottom and
 * are stored flat in the `timelineLayers` Y.Map keyed by `id`, ordered by
 * ascending `order` (fractional float so inserts never rewrite neighbours).
 */
export type TimelineLayer = {
    id: string;
    name: string;
    order: number;
    /** Parent layer id for nesting; null/undefined = a root lane. Siblings are
     *  ordered by ascending `order` (fractional float, like the document tree). */
    parentId?: string | null;
};

/**
 * A clip placed on the Timeline: a colored box on a single layer spanning a
 * range of the minute-based ruler. Stored flat in the `timelineClips` Y.Map
 * keyed by `id`.
 *
 * `start`/`duration` are measured in minutes. Each clip references a live source
 * element via (`source`, `refDocId`, `refId`); `title`/`preview`/`color` are a
 * cached snapshot kept fresh by the Timeline's resolver and shown (greyed) when
 * the source no longer exists.
 */
export type TimelineClip = {
    id: string;
    /** Owning layer id. */
    layerId: string;
    /** Start offset from the timeline origin, in minutes. */
    start: number;
    /** Length of the clip, in minutes. */
    duration: number;
    source: TimelineClipSource;
    /** card: board docId · scene: MAIN_SCREENPLAY_REF or the editor doc id. */
    refDocId: string;
    /** card: card id · scene: scene heading `data-id`. */
    refId: string;
    title: string;
    preview: string;
    color?: string;
};

// -------------------------------- //
//          PROJECT DATA            //
// -------------------------------- //

export type ProjectData = {
    screenplay: JSONContent[];
    titlepage?: JSONContent[];
    characters: Record<string, CharacterItem>;
    scenes: Record<string, PersistentScene>;
    pages: Record<string, PersistentPage>;
    locations: Record<string, LocationItem>;
    metadata: ProjectMetadata;
    documents?: Record<string, DocumentNode>;
    timelineLayers?: Record<string, TimelineLayer>;
    timelineClips?: Record<string, TimelineClip>;
    layout: LayoutData;
    production: ProductionData;
    comments?: Record<string, Comment>;
    shelf?: Record<string, ShelfEntry>;
    /** Per-project custom dictionary words (keys are words, values are true). */
    dictionary?: Record<string, boolean>;
    /** Content of every `editor` document node's fragment, keyed by node id. */
    documentContent?: Record<string, JSONContent[]>;
    /** Board data (cards + arrows) for every `board` node, keyed by node id. */
    boardContent?: Record<string, BoardData>;
    /** Content of every shelf version, keyed by `${nodeId}::${versionId}`. */
    shelfContent?: Record<string, JSONContent[]>;
};

/**
 * Helper to provide stronger typing for Y.Map where different keys have different types.
 */
export interface TypedMap<T extends Record<string, unknown>>
    extends Omit<Y.Map<T[keyof T]>, "get" | "set" | "toJSON"> {
    get<K extends keyof T>(key: K): T[K] | undefined;
    set<K extends keyof T>(key: K, value: T[K]): T[K];
    toJSON(): T;
}

// -------------------------------- //
//          PROJECT STATE           //
// -------------------------------- //

/**
 * Y.Doc subclass with typed accessors for Scriptio's schema. All accessors
 * are pure Y.js operations — no ProseMirror, no React. Safe to instantiate
 * in the DurableObject. Browser-only ProseMirror conversion lives in
 * `project-state.ts` as standalone helpers.
 */
export class ProjectState extends Y.Doc {
    KEYS = {
        SCREENPLAY: "screenplay",
        TITLEPAGE: "titlepage",
        CHARACTERS: "characters",
        SCENES: "scenes",
        PAGES: "pages",
        LOCATIONS: "locations",
        METADATA: "metadata",
        DOCUMENTS: "documents",
        TIMELINE_LAYERS: "timelineLayers",
        TIMELINE_CLIPS: "timelineClips",
        LAYOUT: "layout",
        PRODUCTION: "production",
        COMMENTS: "comments",
        DICTIONARY: "dictionary",
        SHELF: "shelf",
        REVISION_BASE: "revisionBase",
    } as const;

    private _readOnly: boolean = false;

    setReadOnly(readOnly: boolean): void {
        this._readOnly = readOnly;
    }

    get isReadOnly(): boolean {
        return this._readOnly;
    }

    metadata(): TypedMap<ProjectMetadata> {
        return this.getMap(this.KEYS.METADATA) as unknown as TypedMap<ProjectMetadata>;
    }

    screenplayFragment(): Y.XmlFragment {
        return this.getXmlFragment(this.KEYS.SCREENPLAY);
    }

    titlepageFragment(): Y.XmlFragment {
        return this.getXmlFragment(this.KEYS.TITLEPAGE);
    }

    characters(): Y.Map<CharacterItem> {
        return this.getMap(this.KEYS.CHARACTERS);
    }

    locations(): Y.Map<LocationItem> {
        return this.getMap(this.KEYS.LOCATIONS);
    }

    scenes(): Y.Map<PersistentScene> {
        return this.getMap(this.KEYS.SCENES);
    }

    pages(): Y.Map<PersistentPage> {
        return this.getMap(this.KEYS.PAGES);
    }

    /** Document-hierarchy nodes (folders, editor docs, boards) keyed by node id. */
    documents(): Y.Map<DocumentNode> {
        return this.getMap(this.KEYS.DOCUMENTS);
    }

    /** Timeline layers (lanes) keyed by layer id. */
    timelineLayers(): Y.Map<TimelineLayer> {
        return this.getMap(this.KEYS.TIMELINE_LAYERS);
    }

    /** Timeline clips (boxes) keyed by clip id. */
    timelineClips(): Y.Map<TimelineClip> {
        return this.getMap(this.KEYS.TIMELINE_CLIPS);
    }

    /** Content fragment for an `editor` document node. */
    documentFragment(docId: string): Y.XmlFragment {
        return this.getXmlFragment(`doc_${docId}`);
    }

    /** Per-board data map (cards + arrows) for a `board` document node. */
    boardData(docId: string): TypedMap<BoardData> {
        return this.getMap(`board_${docId}`) as unknown as TypedMap<BoardData>;
    }

    layout(): TypedMap<LayoutData> {
        return this.getMap(this.KEYS.LAYOUT) as unknown as TypedMap<LayoutData>;
    }

    production(): TypedMap<ProductionData> {
        return this.getMap(this.KEYS.PRODUCTION) as unknown as TypedMap<ProductionData>;
    }

    comments(): Y.Map<Comment> {
        return this.getMap(this.KEYS.COMMENTS);
    }

    /** Per-project custom dictionary words (keys are words, values are true). */
    dictionary(): Y.Map<boolean> {
        return this.getMap(this.KEYS.DICTIONARY);
    }

    /** Shelf entries keyed by node UUID. */
    shelf(): Y.Map<ShelfEntry> {
        return this.getMap(this.KEYS.SHELF);
    }

    /** Get the Y.XmlFragment for a specific shelf version's content. */
    shelfFragment(nodeId: string, versionId: string): Y.XmlFragment {
        return this.getXmlFragment(`shelf_${nodeId}_${versionId}`);
    }

    /**
     * Per-line text as of the moment the current revision opened, keyed by the
     * line's stable `data-id`. Read on the debounced revision flush to decide
     * whether an edited line still differs from the draft it is being compared
     * to — a line restored to its baseline loses this revision's marks. Replaced
     * wholesale whenever the revision advances, so it holds one draft's worth of
     * text and never grows with the number of revisions. See
     * `RevisionBaseEntry` in `src/lib/screenplay/revisions.ts` for the meaning of
     * a `null` value, and `revisionBaseIndex` in {@link ProductionData} for the
     * revision it belongs to.
     */
    revisionBase(): Y.Map<RevisionBaseEntry> {
        return this.getMap(this.KEYS.REVISION_BASE);
    }
}

