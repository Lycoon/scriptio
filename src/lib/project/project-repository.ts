import { v7 as uuidv7 } from "uuid";
import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { ScreenplaySchema } from "../screenplay/editor";
import { Comment, CommentReply, Screenplay } from "../utils/types";
import {
    LayoutData,
    ProductionData,
    ProjectMetadata,
    ProjectState,
    ElementStyle,
    PageMargin,
    ShelfEntry,
    ShelfEntryType,
    ShelfVersionMeta,
    DocumentNode,
    TimelineLayer,
    TimelineClip,
    screenplayOf,
} from "./project-state";
import { CharacterMap } from "../screenplay/characters";
import { LocationMap } from "../screenplay/locations";
import { computeSceneItems, PersistentScene, PersistentSceneMap, TransientScene } from "../screenplay/scenes";
import { PersistentPage, PersistentPageMap } from "../screenplay/page-locking";
import { RevisionDisplayMode } from "../screenplay/revisions";
import { PageFormat } from "../utils/enums";
import { generateNodeId } from "../screenplay/nodes";
import { JSONContent } from "@tiptap/react";

/**
 * ProjectRepository provides a clean interface for interacting with the Y.js document (ProjectState).
 * It encapsulates all operations related to screenplay data, providing type-safe methods
 * for reading and observing changes.
 *
 * This class is designed to be instantiated once per project and shared across components
 * that need to interact with the project's Y.js document.
 */
export class ProjectRepository {
    private ydoc: ProjectState;

    private _screenplay: Screenplay | null = null;
    private _screenplayCallbacks = new Set<(s: Screenplay) => void>();
    private _screenplayTimer: ReturnType<typeof setTimeout> | null = null;
    private _screenplayUnobserve: (() => void) | null = null;

    constructor(ydoc: ProjectState) {
        this.ydoc = ydoc;
    }

    setReadOnly(readOnly: boolean): void {
        this.ydoc.setReadOnly(readOnly);
    }

    get readOnly(): boolean {
        return this.ydoc.isReadOnly;
    }

    private guardWrite(op: string): boolean {
        if (this.ydoc.isReadOnly) {
            console.warn(`[Repo] Blocked ${op}: project is read-only`);
            return true;
        }
        return false;
    }

    /**
     * Get the underlying Y.js document.
     * Use sparingly - prefer using repository methods when possible.
     */
    getState(): ProjectState {
        return this.ydoc;
    }

    /**
     * Get the client ID of the current Y.js document instance.
     * Useful for identifying the current user in collaborative scenarios.
     */
    getClientId(): number {
        return this.ydoc.clientID;
    }

    // -------------------------------- //
    //          SCREENPLAY              //
    // -------------------------------- //

    /**
     * Get the screenplay as a Screenplay (ProseMirror JSONContent) object.
     * This converts the Y.js XmlFragment to a ProseMirror document structure.
     */
    get screenplay(): Screenplay {
        return screenplayOf(this.ydoc);
    }

    /**
     * Observe changes to the screenplay fragment.
     * The callback will be invoked whenever the screenplay content changes.
     *
     * @param callback - Function to call when screenplay changes
     * @returns Cleanup function to unsubscribe from changes
     */
    registerScreenplayCallback(callback: (screenplay: Screenplay) => void): void {
        if (this._screenplayCallbacks.size === 0) {
            const fragment = this.ydoc.screenplayFragment();
            const observer = () => {
                if (this._screenplayTimer) clearTimeout(this._screenplayTimer);
                this._screenplayTimer = setTimeout(() => {
                    this._screenplay = this.screenplay;
                    this._screenplayCallbacks.forEach((cb) => cb(this._screenplay!));
                }, 500);
            };
            fragment.observeDeep(observer);
            this._screenplayUnobserve = () => fragment.unobserveDeep(observer);
        }
        this._screenplayCallbacks.add(callback);
        if (this._screenplay !== null) callback(this._screenplay);
    }

    unregisterScreenplayCallback(callback: (screenplay: Screenplay) => void): void {
        this._screenplayCallbacks.delete(callback);
        if (this._screenplayCallbacks.size === 0) {
            if (this._screenplayTimer) {
                clearTimeout(this._screenplayTimer);
                this._screenplayTimer = null;
            }
            this._screenplayUnobserve?.();
            this._screenplayUnobserve = null;
        }
    }

    // -------------------------------- //
    //          METADATA                //
    // -------------------------------- //

    getTitle(): string {
        return this.ydoc.metadata().get("title") ?? "";
    }

    getAuthor(): string {
        return this.ydoc.metadata().get("author") ?? "";
    }

    setTitle(title: string): void {
        if (this.guardWrite("setTitle")) return;
        this.ydoc.metadata().set("title", title);
    }

    setAuthor(author: string): void {
        if (this.guardWrite("setAuthor")) return;
        this.ydoc.metadata().set("author", author);
    }

    /** Target feature length in minutes (defaults to 90 when unset). */
    getFeatureLength(): number {
        return this.ydoc.metadata().get("featureLength") ?? 90;
    }

    setFeatureLength(minutes: number): void {
        if (this.guardWrite("setFeatureLength")) return;
        this.ydoc.metadata().set("featureLength", minutes);
    }

    observeMetadata(callback: (metadata: Partial<ProjectMetadata>) => void): () => void {
        const map = this.ydoc.metadata();
        const observer = () => callback(map.toJSON() as Partial<ProjectMetadata>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // -------------------------------- //
    //          TITLE PAGE              //
    // -------------------------------- //

    /**
     * Observe changes to the title page fragment.
     * The callback will be invoked whenever the title page content changes.
     *
     * @param callback - Function to call when title page changes
     * @param delay - Debounce delay in milliseconds
     * @returns Cleanup function to unsubscribe from changes
     */
    observeTitlePage(callback: () => void, delay: number = 300): () => void {
        const fragment = this.ydoc.titlepageFragment();
        let timeout: NodeJS.Timeout;

        const observer = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                callback();
            }, delay);
        };

        fragment.observeDeep(observer);
        return () => {
            clearTimeout(timeout);
            fragment.unobserveDeep(observer);
        };
    }

    // -------------------------------- //
    //          CHARACTERS              //
    // -------------------------------- //

    /**
     * Get the raw persistent characters map from Y.js
     */
    get characters(): CharacterMap {
        return this.ydoc.characters().toJSON();
    }

    /**
     * Observe changes to the persistent character map (e.g., user renames a char in the sidebar)
     */
    observeCharacters(callback: (chars: CharacterMap) => void): () => void {
        const map = this.ydoc.characters();
        const observer = () => callback(map.toJSON() as CharacterMap);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // -------------------------------- //
    //          LOCATIONS               //
    // -------------------------------- //

    /**
     * Get the raw persistent locations map from Y.js
     */
    get locations(): LocationMap {
        return this.ydoc.locations().toJSON();
    }

    /**
     * Observe changes to the persistent location map
     */
    observeLocations(callback: (locations: LocationMap) => void): () => void {
        const map = this.ydoc.locations();
        const observer = () => callback(map.toJSON() as LocationMap);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // -------------------------------- //
    //            SCENES                //
    // -------------------------------- //

    /**
     * Get the persistent scenes map from Y.js.
     * Keys are scene ids (UUIDs), values are PersistentScene objects.
     */
    get scenes(): PersistentSceneMap {
        return this.ydoc.scenes().toJSON() as PersistentSceneMap;
    }

    /**
     * Get a single persistent scene by id.
     */
    getScene(sceneId: string): PersistentScene | undefined {
        const map = this.ydoc.scenes();
        return map.get(sceneId) as PersistentScene | undefined;
    }

    /**
     * Create or update a scene's persistent data.
     *
     * Fields that appear in `data` (including ones explicitly set to undefined)
     * overwrite the corresponding existing fields; everything else is preserved.
     * Any final undefined values are stripped before writing.
     *
     * Returns the scene id.
     */
    upsertScene(sceneId: string, data: Partial<PersistentScene>): string {
        if (this.guardWrite("upsertScene")) return sceneId;
        const map = this.ydoc.scenes();
        const existing = (map.get(sceneId) as PersistentScene | undefined) ?? {};

        const merged: PersistentScene = { ...existing };
        const FIELDS = [
            "synopsis", "color", "token", "omitted", "originalHeading",
            "omittedBody", "omittedPageLocks", "reanchoredSuccessor",
        ] as const;
        for (const key of FIELDS) {
            if (key in data) {
                (merged as Record<string, unknown>)[key] = data[key];
            }
        }
        for (const key of FIELDS) {
            if (merged[key] === undefined) delete merged[key];
        }

        map.set(sceneId, merged);
        return sceneId;
    }

    /**
     * Make a scene persistent by creating an entry in the Yjs map.
     * Returns the new scene id (UUID).
     */
    persistScene(data?: Partial<PersistentScene>): string {
        const sceneId = uuidv7();
        return this.upsertScene(sceneId, data ?? {});
    }

    /**
     * Duplicate a scene's persistent data under a new id.
     * Used when a persistent scene heading is copy-pasted.
     */
    duplicateScene(originalId: string, newId: string): void {
        const original = this.getScene(originalId);
        if (original) {
            this.upsertScene(newId, { ...original });
        }
    }

    /**
     * Delete a scene's persistent data.
     */
    deleteScene(sceneId: string): void {
        if (this.guardWrite("deleteScene")) return;
        const map = this.ydoc.scenes();
        if (map.has(sceneId)) {
            map.delete(sceneId);
            console.log(`[Scenes] Deleted scene: ${sceneId}`);
        }
    }

    /**
     * Observe changes to the persistent scenes map.
     */
    observeScenes(callback: (scenes: PersistentSceneMap) => void): () => void {
        const map = this.ydoc.scenes();
        const observer = () => callback(map.toJSON() as PersistentSceneMap);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // -------------------------------- //
    //            LAYOUT                //
    // -------------------------------- //

    /**
     * Read the current layout data snapshot.
     */
    getLayout(): Partial<LayoutData> {
        return this.ydoc.layout().toJSON() as Partial<LayoutData>;
    }

    /**
     * Observe changes to the project layout
     */
    observeLayout(callback: (layout: Partial<LayoutData>) => void): () => void {
        const map = this.ydoc.layout();
        const observer = () => callback(map.toJSON() as Partial<LayoutData>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    setPageSize(pageSize: PageFormat) {
        if (this.guardWrite("setPageSize")) return;
        this.ydoc.layout().set("pageSize", pageSize);
    }
    setPageMargins(margins: PageMargin) {
        if (this.guardWrite("setPageMargins")) return;
        this.ydoc.layout().set("pageMargins", margins);
    }
    setDisplaySceneNumbers(display: boolean) {
        if (this.guardWrite("setDisplaySceneNumbers")) return;
        this.ydoc.layout().set("displaySceneNumbers", display);
    }
    setSceneHeadingSpacing(spacing: number) {
        if (this.guardWrite("setSceneHeadingSpacing")) return;
        this.ydoc.layout().set("sceneHeadingSpacing", spacing);
    }
    setSceneNumberOnRight(onRight: boolean) {
        if (this.guardWrite("setSceneNumberOnRight")) return;
        this.ydoc.layout().set("sceneNumberOnRight", onRight);
    }
    setContdLabel(label: string) {
        if (this.guardWrite("setContdLabel")) return;
        this.ydoc.layout().set("contdLabel", label);
    }
    setMoreLabel(label: string) {
        if (this.guardWrite("setMoreLabel")) return;
        this.ydoc.layout().set("moreLabel", label);
    }
    setHeaderLeft(template: string) {
        if (this.guardWrite("setHeaderLeft")) return;
        this.ydoc.layout().set("headerLeft", template);
    }
    setHeaderMiddle(template: string) {
        if (this.guardWrite("setHeaderMiddle")) return;
        this.ydoc.layout().set("headerMiddle", template);
    }
    setHeaderRight(template: string) {
        if (this.guardWrite("setHeaderRight")) return;
        this.ydoc.layout().set("headerRight", template);
    }
    setShowFirstPageHeader(show: boolean) {
        if (this.guardWrite("setShowFirstPageHeader")) return;
        this.ydoc.layout().set("showFirstPageHeader", show);
    }
    setFooterLeft(template: string) {
        if (this.guardWrite("setFooterLeft")) return;
        this.ydoc.layout().set("footerLeft", template);
    }
    setFooterMiddle(template: string) {
        if (this.guardWrite("setFooterMiddle")) return;
        this.ydoc.layout().set("footerMiddle", template);
    }
    setFooterRight(template: string) {
        if (this.guardWrite("setFooterRight")) return;
        this.ydoc.layout().set("footerRight", template);
    }
    setShowFirstPageFooter(show: boolean) {
        if (this.guardWrite("setShowFirstPageFooter")) return;
        this.ydoc.layout().set("showFirstPageFooter", show);
    }
    setElementMargins(margins: Record<string, { left: number; right: number }>) {
        if (this.guardWrite("setElementMargins")) return;
        this.ydoc.layout().set("elementMargins", margins);
    }
    setElementStyles(styles: Record<string, ElementStyle>) {
        if (this.guardWrite("setElementStyles")) return;
        this.ydoc.layout().set("elementStyles", styles);
    }

    // -------------------------------- //
    //           PRODUCTION             //
    // -------------------------------- //

    getProduction(): Partial<ProductionData> {
        return this.ydoc.production().toJSON() as Partial<ProductionData>;
    }

    observeProduction(callback: (production: Partial<ProductionData>) => void): () => void {
        const map = this.ydoc.production();
        const observer = () => callback(map.toJSON() as Partial<ProductionData>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    setSceneLocking(locked: boolean) {
        if (this.guardWrite("setSceneLocking")) return;
        this.ydoc.production().set("sceneLocking", locked);
    }
    setPageLocking(locked: boolean) {
        if (this.guardWrite("setPageLocking")) return;
        this.ydoc.production().set("pageLocking", locked);
    }
    setRevisionsEnabled(enabled: boolean) {
        if (this.guardWrite("setRevisionsEnabled")) return;
        this.ydoc.production().set("revisionsEnabled", enabled);
    }
    setCurrentRevision(index: number) {
        if (this.guardWrite("setCurrentRevision")) return;
        this.ydoc.production().set("currentRevision", index);
    }
    setRevisionDisplayMode(mode: RevisionDisplayMode) {
        if (this.guardWrite("setRevisionDisplayMode")) return;
        this.ydoc.production().set("revisionDisplayMode", mode);
    }
    setSceneNumberingStyle(style: "suffix" | "prefix") {
        if (this.guardWrite("setSceneNumberingStyle")) return;
        this.ydoc.production().set("sceneNumberingStyle", style);
    }
    setSkippedSceneLetters(letters: string[]) {
        if (this.guardWrite("setSkippedSceneLetters")) return;
        this.ydoc.production().set("skippedSceneLetters", letters);
    }

    /**
     * Strip the frozen production `token` from every persistent scene entry.
     * Entries that have no remaining content (no `synopsis`, `color`, or
     * `omitted` flag) are deleted outright. Used by the Production panel
     * when the user unlocks scenes. The `omitted` flag is preserved — omit
     * is independent of production lock and survives unlock.
     */
    clearSceneLocks(): void {
        if (this.guardWrite("clearSceneLocks")) return;
        const map = this.ydoc.scenes();
        const entries: [string, PersistentScene][] = [];
        map.forEach((value, key) => {
            entries.push([key, value as PersistentScene]);
        });
        for (const [uuid, scene] of entries) {
            const next: PersistentScene = { ...scene };
            delete next.token;
            if (!next.synopsis && !next.color && !next.omitted) {
                map.delete(uuid);
            } else {
                map.set(uuid, next);
            }
        }
    }

    /**
     * Raw persistent page-lock map keyed by anchor data-id (with the
     * sentinel `PAGE_ONE_KEY` for page 1). Empty when page locking has
     * never been enabled.
     */
    get pages(): PersistentPageMap {
        return this.ydoc.pages().toJSON() as PersistentPageMap;
    }

    getPage(anchorId: string): PersistentPage | undefined {
        const map = this.ydoc.pages();
        return map.get(anchorId) as PersistentPage | undefined;
    }

    /**
     * Create or update a page lock keyed by its anchor data-id.
     * Fields present in `data` (including explicit `undefined`s) overwrite
     * the existing fields; everything else is preserved. Final undefined
     * values are stripped before writing.
     */
    upsertPage(anchorId: string, data: Partial<PersistentPage>): string {
        if (this.guardWrite("upsertPage")) return anchorId;
        const map = this.ydoc.pages();
        const existing = (map.get(anchorId) as PersistentPage | undefined) ?? {};

        const merged: PersistentPage = { ...existing };
        const FIELDS = ["token", "splitOffset"] as const;
        for (const key of FIELDS) {
            if (key in data) {
                (merged as Record<string, unknown>)[key] = data[key];
            }
        }
        for (const key of FIELDS) {
            if (merged[key] === undefined) delete merged[key];
        }

        map.set(anchorId, merged);
        return anchorId;
    }

    deletePage(anchorId: string): void {
        if (this.guardWrite("deletePage")) return;
        const map = this.ydoc.pages();
        if (map.has(anchorId)) {
            map.delete(anchorId);
        }
    }

    /**
     * Wipe every persistent page-lock entry. Used when the user toggles
     * page locking off — pagination reverts to plain integer numbering.
     */
    clearPageLocks(): void {
        if (this.guardWrite("clearPageLocks")) return;
        const map = this.ydoc.pages();
        const keys: string[] = [];
        map.forEach((_, key) => keys.push(key));
        for (const key of keys) map.delete(key);
    }

    observePages(callback: (pages: PersistentPageMap) => void): () => void {
        const map = this.ydoc.pages();
        const observer = () => callback(map.toJSON() as PersistentPageMap);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    /**
     * Run a function inside a single Y.js transaction.
     * Useful for batching multiple repository mutations into one collab update.
     *
     * Pass `origin` to tag the transaction — required for the Y.UndoManager
     * to track the changes (the manager ignores transactions whose origin is
     * not in its `trackedOrigins` set). Custom origins must also be added to
     * the editor's `trackedOrigins` set; see `use-document-editor.ts`.
     */
    transact(fn: () => void, origin?: unknown): void {
        if (this.guardWrite("transact")) return;
        this.ydoc.transact(fn, origin);
    }

    // -------------------------------- //
    //            COMMENTS              //
    // -------------------------------- //

    /**
     * Generic comment operations — work on any Y.Map<Comment> keyed by comment UUID.
     * Use the convenience wrappers below for the main screenplay comments.
     */

    getCommentsFromMap(map: Y.Map<Comment>): Record<string, Comment> {
        return map.toJSON() as Record<string, Comment>;
    }

    getCommentFromMap(map: Y.Map<Comment>, commentId: string): Comment | undefined {
        return map.get(commentId);
    }

    addCommentToMap(map: Y.Map<Comment>, comment: Omit<Comment, "id">): string {
        if (this.guardWrite("addComment")) return "";
        const id = uuidv7();
        map.set(id, { ...comment, id });
        return id;
    }

    updateCommentInMap(map: Y.Map<Comment>, commentId: string, data: Partial<Comment>): void {
        if (this.guardWrite("updateComment")) return;
        const existing = map.get(commentId);
        if (!existing) return;
        map.set(commentId, { ...existing, ...data });
    }

    resolveCommentInMap(map: Y.Map<Comment>, commentId: string): void {
        this.updateCommentInMap(map, commentId, { resolved: true });
    }

    addReplyToMap(map: Y.Map<Comment>, commentId: string, reply: Omit<CommentReply, "id">): string | undefined {
        if (this.guardWrite("addReply")) return undefined;
        const existing = map.get(commentId);
        if (!existing) return undefined;
        const id = uuidv7();
        const replies = [...(existing.replies ?? []), { ...reply, id }];
        map.set(commentId, { ...existing, replies });
        return id;
    }

    deleteCommentFromMap(map: Y.Map<Comment>, commentId: string): void {
        if (this.guardWrite("deleteComment")) return;
        if (map.has(commentId)) {
            map.delete(commentId);
        }
    }

    observeCommentsMap(map: Y.Map<Comment>, callback: (comments: Record<string, Comment>) => void): () => void {
        const observer = () => callback(map.toJSON() as Record<string, Comment>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // ---- Screenplay comment convenience wrappers ----

    get comments(): Record<string, Comment> {
        return this.getCommentsFromMap(this.ydoc.comments());
    }

    getComment(commentId: string): Comment | undefined {
        return this.getCommentFromMap(this.ydoc.comments(), commentId);
    }

    addComment(comment: Omit<Comment, "id">): string {
        return this.addCommentToMap(this.ydoc.comments(), comment);
    }

    updateComment(commentId: string, data: Partial<Comment>): void {
        this.updateCommentInMap(this.ydoc.comments(), commentId, data);
    }

    resolveComment(commentId: string): void {
        this.resolveCommentInMap(this.ydoc.comments(), commentId);
    }

    addReply(commentId: string, reply: Omit<CommentReply, "id">): string | undefined {
        return this.addReplyToMap(this.ydoc.comments(), commentId, reply);
    }

    deleteComment(commentId: string): void {
        this.deleteCommentFromMap(this.ydoc.comments(), commentId);
    }

    observeComments(callback: (comments: Record<string, Comment>) => void): () => void {
        return this.observeCommentsMap(this.ydoc.comments(), callback);
    }

    // -------------------------------- //
    //              SHELF               //
    // -------------------------------- //

    get shelfEntries(): Record<string, ShelfEntry> {
        return this.ydoc.shelf().toJSON() as Record<string, ShelfEntry>;
    }

    getShelfEntry(nodeId: string): ShelfEntry | undefined {
        return this.ydoc.shelf().get(nodeId) as ShelfEntry | undefined;
    }

    /** Create a new shelf entry or add a version to an existing one. Returns the version ID. */
    shelveNode(nodeId: string, title: string, type: ShelfEntryType, content: JSONContent[]): string {
        if (this.guardWrite("shelveNode")) return "";
        const map = this.ydoc.shelf();
        const existing = map.get(nodeId) as ShelfEntry | undefined;
        const versionId = generateNodeId();
        const versionMeta: ShelfVersionMeta = {
            id: versionId,
            title: new Date().toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }),
        };

        const entry: ShelfEntry = {
            title,
            type,
            versions: [...(existing?.versions ?? []), versionMeta],
        };

        this.ydoc.transact(() => {
            map.set(nodeId, entry);
            const fragment = this.ydoc.shelfFragment(nodeId, versionId);
            prosemirrorJSONToYXmlFragment(ScreenplaySchema, { type: "doc", content }, fragment);
        });

        return versionId;
    }

    renameShelfVersion(nodeId: string, versionId: string, newTitle: string): void {
        if (this.guardWrite("renameShelfVersion")) return;
        const map = this.ydoc.shelf();
        const entry = map.get(nodeId) as ShelfEntry | undefined;
        if (!entry) return;
        const versions = entry.versions.map((v) => (v.id === versionId ? { ...v, title: newTitle } : v));
        map.set(nodeId, { ...entry, versions });
    }

    deleteShelfEntry(nodeId: string): void {
        if (this.guardWrite("deleteShelfEntry")) return;
        const map = this.ydoc.shelf();
        const entry = map.get(nodeId) as ShelfEntry | undefined;
        if (!entry) return;

        this.ydoc.transact(() => {
            for (const v of entry.versions) {
                const frag = this.ydoc.shelfFragment(nodeId, v.id);
                if (frag.length > 0) frag.delete(0, frag.length);
            }
            map.delete(nodeId);
        });
    }

    deleteShelfVersion(nodeId: string, versionId: string): void {
        if (this.guardWrite("deleteShelfVersion")) return;
        const map = this.ydoc.shelf();
        const entry = map.get(nodeId) as ShelfEntry | undefined;
        if (!entry) return;

        this.ydoc.transact(() => {
            const frag = this.ydoc.shelfFragment(nodeId, versionId);
            if (frag.length > 0) frag.delete(0, frag.length);

            const versions = entry.versions.filter((v) => v.id !== versionId);
            if (versions.length === 0) {
                map.delete(nodeId);
            } else {
                map.set(nodeId, { ...entry, versions });
            }
        });
    }

    /** Get the content of a shelf version as ProseMirror JSONContent nodes. */
    getShelfVersionContent(nodeId: string, versionId: string): JSONContent[] {
        const fragment = this.ydoc.shelfFragment(nodeId, versionId);
        const root = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
        return root.content.toJSON() as JSONContent[];
    }

    observeShelf(callback: (entries: Record<string, ShelfEntry>) => void): () => void {
        const map = this.ydoc.shelf();
        const observer = () => callback(map.toJSON() as Record<string, ShelfEntry>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    // -------------------------------- //
    //          DOCUMENT TREE           //
    // -------------------------------- //

    /** All document-hierarchy nodes keyed by node id. */
    get documents(): Record<string, DocumentNode> {
        return this.ydoc.documents().toJSON() as Record<string, DocumentNode>;
    }

    getDocumentNode(id: string): DocumentNode | undefined {
        return this.ydoc.documents().get(id) as DocumentNode | undefined;
    }

    observeDocuments(callback: (documents: Record<string, DocumentNode>) => void): () => void {
        const map = this.ydoc.documents();
        const observer = () => callback(map.toJSON() as Record<string, DocumentNode>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    /** Append position = one past the greatest order among the parent's children. */
    private nextDocumentOrder(parentId: string | null): number {
        let max = -1;
        this.ydoc.documents().forEach((node) => {
            if (node.parentId === parentId && node.order > max) max = node.order;
        });
        return max + 1;
    }

    /** Is `ancestorId` an ancestor of `nodeId`? Used to block cyclic moves. */
    private isDocumentAncestor(nodeId: string, ancestorId: string): boolean {
        const map = this.ydoc.documents();
        const seen = new Set<string>();
        let cur = map.get(nodeId) as DocumentNode | undefined;
        while (cur && cur.parentId) {
            if (seen.has(cur.id)) break;
            seen.add(cur.id);
            if (cur.parentId === ancestorId) return true;
            cur = map.get(cur.parentId) as DocumentNode | undefined;
        }
        return false;
    }

    createFolder(title: string, parentId: string | null = null): string {
        if (this.guardWrite("createFolder")) return "";
        const id = uuidv7();
        this.ydoc
            .documents()
            .set(id, { id, type: "folder", title, parentId, order: this.nextDocumentOrder(parentId) });
        return id;
    }

    /**
     * Create an `editor` document node. Its content lives in a dedicated
     * Y.XmlFragment (`doc_<id>`) which is left empty — an empty fragment binds
     * to a fresh screenplay editor exactly like a brand-new project's main
     * screenplay, so no seeding is required.
     */
    createEditorDocument(title: string, parentId: string | null = null): string {
        if (this.guardWrite("createEditorDocument")) return "";
        const id = uuidv7();
        this.ydoc
            .documents()
            .set(id, { id, type: "editor", title, parentId, order: this.nextDocumentOrder(parentId) });
        return id;
    }

    /**
     * Create a `board` document node. Each board owns a dedicated data map
     * (`board_<id>`, read via `boardData(id)`); a project may hold any number
     * of boards. Returns the new board node id.
     */
    createBoardDocument(title: string, parentId: string | null = null): string {
        if (this.guardWrite("createBoardDocument")) return "";
        const id = uuidv7();
        this.ydoc
            .documents()
            .set(id, { id, type: "board", title, parentId, order: this.nextDocumentOrder(parentId) });
        return id;
    }

    renameDocument(id: string, title: string): void {
        if (this.guardWrite("renameDocument")) return;
        const map = this.ydoc.documents();
        const node = map.get(id) as DocumentNode | undefined;
        if (!node) return;
        map.set(id, { ...node, title });
    }

    /** Set (or clear, with `undefined`) a document node's accent color. */
    setDocumentColor(id: string, color: string | undefined): void {
        if (this.guardWrite("setDocumentColor")) return;
        const map = this.ydoc.documents();
        const node = map.get(id) as DocumentNode | undefined;
        if (!node) return;
        map.set(id, { ...node, color });
    }

    /**
     * Move a node under a new parent at the given fractional order. No-ops on a
     * move that would create a cycle (into itself or one of its descendants).
     */
    moveDocument(id: string, newParentId: string | null, order: number): void {
        if (this.guardWrite("moveDocument")) return;
        const map = this.ydoc.documents();
        const node = map.get(id) as DocumentNode | undefined;
        if (!node) return;
        if (newParentId !== null && (newParentId === id || this.isDocumentAncestor(newParentId, id))) {
            return;
        }
        map.set(id, { ...node, parentId: newParentId, order });
    }

    /**
     * Delete a node and all its descendants in one transaction. Editor nodes
     * have their content fragment cleared; board nodes have their per-board
     * data map cleared.
     */
    deleteDocument(id: string): void {
        if (this.guardWrite("deleteDocument")) return;
        const map = this.ydoc.documents();
        if (!map.has(id)) return;

        const all = map.toJSON() as Record<string, DocumentNode>;
        const toDelete: string[] = [];
        const stack = [id];
        while (stack.length > 0) {
            const cur = stack.pop()!;
            toDelete.push(cur);
            for (const node of Object.values(all)) {
                if (node.parentId === cur) stack.push(node.id);
            }
        }

        this.ydoc.transact(() => {
            for (const nid of toDelete) {
                const node = all[nid];
                if (!node) continue;
                if (node.type === "editor") {
                    const frag = this.ydoc.documentFragment(nid);
                    if (frag.length > 0) frag.delete(0, frag.length);
                } else if (node.type === "board") {
                    this.ydoc.boardData(nid).clear();
                }
                map.delete(nid);
            }
        });
    }

    // -------------------------------- //
    //            TIMELINE             //
    // -------------------------------- //

    /** All timeline layers keyed by layer id. */
    get timelineLayers(): Record<string, TimelineLayer> {
        return this.ydoc.timelineLayers().toJSON() as Record<string, TimelineLayer>;
    }

    /** All timeline clips keyed by clip id. */
    get timelineClips(): Record<string, TimelineClip> {
        return this.ydoc.timelineClips().toJSON() as Record<string, TimelineClip>;
    }

    observeTimelineLayers(callback: (layers: Record<string, TimelineLayer>) => void): () => void {
        const map = this.ydoc.timelineLayers();
        const observer = () => callback(map.toJSON() as Record<string, TimelineLayer>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    observeTimelineClips(callback: (clips: Record<string, TimelineClip>) => void): () => void {
        const map = this.ydoc.timelineClips();
        const observer = () => callback(map.toJSON() as Record<string, TimelineClip>);
        map.observe(observer);
        return () => map.unobserve(observer);
    }

    /** Append order = one past the greatest order among the parent's children. */
    private nextLayerOrder(parentId: string | null): number {
        let max = -1;
        this.ydoc.timelineLayers().forEach((layer) => {
            if ((layer.parentId ?? null) === parentId && layer.order > max) max = layer.order;
        });
        return max + 1;
    }

    /** Is `ancestorId` an ancestor of `layerId`? Blocks cyclic nesting. */
    private isLayerAncestor(layerId: string, ancestorId: string): boolean {
        const map = this.ydoc.timelineLayers();
        const seen = new Set<string>();
        let cur = map.get(layerId) as TimelineLayer | undefined;
        while (cur && cur.parentId) {
            if (seen.has(cur.id)) break;
            seen.add(cur.id);
            if (cur.parentId === ancestorId) return true;
            cur = map.get(cur.parentId) as TimelineLayer | undefined;
        }
        return false;
    }

    /**
     * Ensure the timeline has at least `count` layers, creating "Layer N" lanes
     * as needed. Returns the layers ordered by `order`. Used to seed the two
     * default lanes the first time the timeline is opened.
     */
    ensureTimelineLayers(count: number, defaultName: (index: number) => string): TimelineLayer[] {
        if (!this.guardWrite("ensureTimelineLayers")) {
            const existing = Object.values(this.timelineLayers).length;
            if (existing < count) {
                this.ydoc.transact(() => {
                    for (let i = existing; i < count; i++) this.addTimelineLayer(defaultName(i));
                });
            }
        }
        return Object.values(this.timelineLayers).sort((a, b) => a.order - b.order);
    }

    /** Append a new layer under `parentId` (root by default). Returns its id. */
    addTimelineLayer(name: string, parentId: string | null = null): string {
        if (this.guardWrite("addTimelineLayer")) return "";
        const id = uuidv7();
        this.ydoc.timelineLayers().set(id, { id, name, parentId, order: this.nextLayerOrder(parentId) });
        return id;
    }

    renameTimelineLayer(id: string, name: string): void {
        if (this.guardWrite("renameTimelineLayer")) return;
        const map = this.ydoc.timelineLayers();
        const layer = map.get(id) as TimelineLayer | undefined;
        if (!layer) return;
        map.set(id, { ...layer, name });
    }

    /**
     * Re-nest a layer under a new parent at the given fractional order. No-ops on
     * a move that would create a cycle (into itself or one of its descendants).
     */
    moveTimelineLayer(id: string, newParentId: string | null, order: number): void {
        if (this.guardWrite("moveTimelineLayer")) return;
        const map = this.ydoc.timelineLayers();
        const layer = map.get(id) as TimelineLayer | undefined;
        if (!layer) return;
        if (newParentId !== null && (newParentId === id || this.isLayerAncestor(newParentId, id))) return;
        map.set(id, { ...layer, parentId: newParentId, order });
    }

    /**
     * Delete a layer and the clips that live on it. Child layers are promoted to
     * the deleted layer's parent so nested lanes aren't destroyed with it.
     */
    deleteTimelineLayer(id: string): void {
        if (this.guardWrite("deleteTimelineLayer")) return;
        const map = this.ydoc.timelineLayers();
        const target = map.get(id) as TimelineLayer | undefined;
        if (!target) return;
        this.ydoc.transact(() => {
            map.forEach((child) => {
                if ((child.parentId ?? null) === id) {
                    map.set(child.id, { ...child, parentId: target.parentId ?? null });
                }
            });
            map.delete(id);
            const clips = this.ydoc.timelineClips();
            clips.forEach((clip) => {
                if (clip.layerId === id) clips.delete(clip.id);
            });
        });
    }

    /**
     * Add a clip to the timeline. De-duplicates: if a clip already references the
     * same source element, the existing clip's id is returned and nothing added.
     */
    addTimelineClip(clip: Omit<TimelineClip, "id">): string {
        if (this.guardWrite("addTimelineClip")) return "";
        const map = this.ydoc.timelineClips();

        let existingId = "";
        map.forEach((existing) => {
            if (
                existing.source === clip.source &&
                existing.refDocId === clip.refDocId &&
                existing.refId === clip.refId
            ) {
                existingId = existing.id;
            }
        });
        if (existingId) return existingId;

        const id = uuidv7();
        map.set(id, { ...clip, id });
        return id;
    }

    /**
     * "Send to timeline" helper: ensure the default lanes exist, then append a
     * clip to the first layer just after its last clip. De-duplicates via
     * `addTimelineClip`, so sending the same source twice is a no-op.
     */
    appendTimelineClip(
        fields: Pick<TimelineClip, "source" | "refDocId" | "refId" | "title" | "preview" | "color">,
        durationMinutes = 2,
    ): string {
        if (this.guardWrite("appendTimelineClip")) return "";
        let id = "";
        this.ydoc.transact(() => {
            const layers = this.ensureTimelineLayers(2, (i) => `Layer ${i + 1}`);
            // Prefer the first root lane; fall back to the first layer overall.
            const roots = layers.filter((l) => (l.parentId ?? null) === null);
            const layerId = (roots[0] ?? layers[0]).id;
            let end = 0;
            this.ydoc.timelineClips().forEach((c) => {
                if (c.layerId === layerId) end = Math.max(end, c.start + c.duration);
            });
            id = this.addTimelineClip({ ...fields, layerId, start: end, duration: durationMinutes });
        });
        return id;
    }

    /** Patch a clip's placement (layer / start / duration). */
    updateTimelineClip(id: string, patch: Partial<Pick<TimelineClip, "layerId" | "start" | "duration">>): void {
        if (this.guardWrite("updateTimelineClip")) return;
        const map = this.ydoc.timelineClips();
        const clip = map.get(id) as TimelineClip | undefined;
        if (!clip) return;
        map.set(id, { ...clip, ...patch });
    }

    /** Patch the cached display snapshot of a clip (title/preview/color). */
    refreshTimelineClipSnapshot(id: string, snapshot: Pick<TimelineClip, "title" | "preview" | "color">): void {
        if (this.guardWrite("refreshTimelineClipSnapshot")) return;
        const map = this.ydoc.timelineClips();
        const clip = map.get(id) as TimelineClip | undefined;
        if (!clip) return;
        map.set(id, { ...clip, ...snapshot });
    }

    deleteTimelineClip(id: string): void {
        if (this.guardWrite("deleteTimelineClip")) return;
        this.ydoc.timelineClips().delete(id);
    }

    /**
     * Parse an `editor` document's content into transient scenes (heading text +
     * preview + position), so the timeline can resolve scene references that live
     * in document-tree editor docs rather than the main screenplay.
     */
    getEditorDocumentScenes(docId: string): TransientScene[] {
        const fragment = this.ydoc.documentFragment(docId);
        const root = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
        const content = root.content.toJSON() as Screenplay;
        return computeSceneItems(content);
    }
}

/**
 * Factory function to create a ProjectRepository instance.
 * Returns null if ydoc is null.
 */
export function createProjectRepository(ydoc: ProjectState | null): ProjectRepository | null {
    if (!ydoc) {
        return null;
    }
    return new ProjectRepository(ydoc);
}
