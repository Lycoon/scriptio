import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { ScreenplaySchema } from "../screenplay/editor";
import { Comment, CommentReply, Screenplay } from "../utils/types";
import { LayoutData, ProjectState, ElementStyle, PageMargin } from "./project-state";
import { CharacterMap } from "../screenplay/characters";
import { LocationMap } from "../screenplay/locations";
import { PersistentScene, PersistentSceneMap } from "../screenplay/scenes";
import { PageFormat } from "../utils/enums";

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

    constructor(ydoc: ProjectState) {
        this.ydoc = ydoc;
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
        return this.ydoc.screenplay();
    }

    /**
     * Observe changes to the screenplay fragment.
     * The callback will be invoked whenever the screenplay content changes.
     *
     * @param callback - Function to call when screenplay changes
     * @returns Cleanup function to unsubscribe from changes
     */
    observeScreenplay(callback: (screenplay: Screenplay) => void, delay: number = 300): () => void {
        const fragment = this.ydoc.screenplayFragment();
        let timeout: NodeJS.Timeout;

        const observer = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const screenplay = this.screenplay;
                callback(screenplay);
            }, delay);
        };

        fragment.observeDeep(observer);
        return () => {
            clearTimeout(timeout);
            fragment.unobserveDeep(observer);
        };
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
        this.ydoc.metadata().set("title", title);
    }

    setAuthor(author: string): void {
        this.ydoc.metadata().set("author", author);
    }

    observeMetadata(callback: (metadata: Record<string, any>) => void): () => void {
        const map = this.ydoc.metadata();
        const observer = () => callback(map.toJSON());
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
     * Returns the scene id.
     */
    upsertScene(sceneId: string, data: Partial<PersistentScene>): string {
        const map = this.ydoc.scenes();
        const existing = map.get(sceneId) as PersistentScene | undefined;

        const sceneData: PersistentScene = {
            synopsis: data.synopsis ?? existing?.synopsis ?? "",
            color: data.color ?? existing?.color,
        };

        map.set(sceneId, sceneData);
        console.log(`[Scenes] Upserted scene: ${sceneId}`);
        return sceneId;
    }

    /**
     * Make a scene persistent by creating an entry in the Yjs map.
     * Returns the new scene id (UUID).
     */
    persistScene(data?: Partial<PersistentScene>): string {
        const sceneId = uuidv4();
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
        const map = this.ydoc.scenes();
        if (map.has(sceneId)) {
            map.delete(sceneId);
            console.log(`[Scenes] Deleted scene: ${sceneId}`);
        }
    }

    /**
     * Update a scene's synopsis.
     */
    setSceneSynopsis(sceneId: string, synopsis: string): void {
        this.upsertScene(sceneId, { synopsis });
    }

    /**
     * Update a scene's color.
     */
    setSceneColor(sceneId: string, color: string | undefined): void {
        this.upsertScene(sceneId, { color });
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
        this.ydoc.layout().set("pageSize", pageSize);
    }
    setPageMargins(margins: PageMargin) {
        this.ydoc.layout().set("pageMargins", margins);
    }
    setDisplaySceneNumbers(display: boolean) {
        this.ydoc.layout().set("displaySceneNumbers", display);
    }
    setSceneHeadingSpacing(spacing: number) {
        this.ydoc.layout().set("sceneHeadingSpacing", spacing);
    }
    setSceneNumberOnRight(onRight: boolean) {
        this.ydoc.layout().set("sceneNumberOnRight", onRight);
    }
    setContdLabel(label: string) {
        this.ydoc.layout().set("contdLabel", label);
    }
    setMoreLabel(label: string) {
        this.ydoc.layout().set("moreLabel", label);
    }
    setElementMargins(margins: Record<string, { left: number; right: number }>) {
        this.ydoc.layout().set("elementMargins", margins);
    }
    setElementStyles(styles: Record<string, ElementStyle>) {
        this.ydoc.layout().set("elementStyles", styles);
    }

    // -------------------------------- //
    //            COMMENTS              //
    // -------------------------------- //

    /**
     * Generic comment operations — work on any Y.Map<any> keyed by comment UUID.
     * Use the convenience wrappers below for the main screenplay comments.
     */

    getCommentsFromMap(map: Y.Map<any>): Record<string, Comment> {
        return map.toJSON() as Record<string, Comment>;
    }

    getCommentFromMap(map: Y.Map<any>, commentId: string): Comment | undefined {
        return map.get(commentId) as Comment | undefined;
    }

    addCommentToMap(map: Y.Map<any>, comment: Omit<Comment, "id">): string {
        const id = uuidv4();
        map.set(id, { ...comment, id });
        return id;
    }

    updateCommentInMap(map: Y.Map<any>, commentId: string, data: Partial<Comment>): void {
        const existing = map.get(commentId) as Comment | undefined;
        if (!existing) return;
        map.set(commentId, { ...existing, ...data });
    }

    resolveCommentInMap(map: Y.Map<any>, commentId: string): void {
        this.updateCommentInMap(map, commentId, { resolved: true });
    }

    addReplyToMap(map: Y.Map<any>, commentId: string, reply: Omit<CommentReply, "id">): string | undefined {
        const existing = map.get(commentId) as Comment | undefined;
        if (!existing) return undefined;
        const id = uuidv4();
        const replies = [...(existing.replies ?? []), { ...reply, id }];
        map.set(commentId, { ...existing, replies });
        return id;
    }

    deleteCommentFromMap(map: Y.Map<any>, commentId: string): void {
        if (map.has(commentId)) {
            map.delete(commentId);
        }
    }

    observeCommentsMap(map: Y.Map<any>, callback: (comments: Record<string, Comment>) => void): () => void {
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
