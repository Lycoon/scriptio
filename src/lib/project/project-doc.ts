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
    elementMargins: Record<string, ElementMargin>;
    elementStyles: Record<string, ElementStyle>;
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
};

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
//          PROJECT DATA            //
// -------------------------------- //

export type ProjectData = {
    screenplay: JSONContent[];
    titlepage?: JSONContent[];
    characters: Record<string, CharacterItem>;
    scenes: Record<string, PersistentScene>;
    locations: Record<string, LocationItem>;
    metadata: ProjectMetadata;
    board: BoardData;
    layout: LayoutData;
    comments?: Record<string, Comment>;
    shelf?: Record<string, ShelfEntry>;
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
        LOCATIONS: "locations",
        METADATA: "metadata",
        BOARD: "board",
        LAYOUT: "layout",
        COMMENTS: "comments",
        DICTIONARY: "dictionary",
        SHELF: "shelf",
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

    board(): TypedMap<BoardData> {
        return this.getMap(this.KEYS.BOARD) as unknown as TypedMap<BoardData>;
    }

    layout(): TypedMap<LayoutData> {
        return this.getMap(this.KEYS.LAYOUT) as unknown as TypedMap<LayoutData>;
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
}

