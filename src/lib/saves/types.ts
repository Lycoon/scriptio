/**
 * The shape a version-history entry takes on the way to the UI.
 *
 * One declaration for both storage targets: the cloud lists R2 objects, the
 * local provider lists IndexedDB rows, and `SavesPanel` renders whichever it is
 * handed without knowing which. Worker-safe by construction — it is a type and
 * nothing else, which is what lets the DurableObject share it.
 */
export interface SaveEntry {
    /** Opaque to the UI. `${projectId}/${type}/${ISO date}` on both sides. */
    key: string;
    type: "auto" | "manual";
    /** Manual saves only — what the user called this version. */
    name?: string;
    /** ISO 8601. */
    date: string;
    size: number;
}
