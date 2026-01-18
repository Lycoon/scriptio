import { v4 as uuidv4 } from "uuid";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { ScreenplaySchema } from "../screenplay/editor";
import { Screenplay } from "../utils/types";
import { LayoutData, ProjectState } from "./project-yjs";
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
    getScreenplay(): Screenplay {
        const fragment = this.ydoc.getXmlFragment(this.ydoc.KEYS.SCREENPLAY);
        const proseMirrorNode = yXmlFragmentToProseMirrorRootNode(fragment, ScreenplaySchema);
        return proseMirrorNode.content.toJSON() as Screenplay;
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
                const screenplay = this.getScreenplay();
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
    setDisplaySceneNumber(display: boolean) {
        this.ydoc.layout().set("displaySceneNumber", display);
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
