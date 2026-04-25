/**
 * Registry of per-project Yjs document migrations.
 *
 * Each migration mutates a `ProjectState` (Y.Doc) in place. The runner wraps
 * the call in a single Y transaction with origin "migration".
 *
 * Hard requirements for `run`:
 *   - **Idempotent**. A cloud-synced project may receive concurrent migrations
 *     from multiple clients; CRDT merge must produce the same state regardless
 *     of how many times the migration ran. In practice: only set keys, don't
 *     append blindly to lists, don't re-derive existing data.
 *   - **Synchronous**. The runner does the transact wrapping.
 *   - **No I/O**. Migrations operate purely on the Y.Doc.
 *
 * Adding a new migration:
 *   1. Append a new step with `from = previous.to`, `to = previous.to + 1`.
 *   2. The runner derives `CURRENT_PROJECT_VERSION` from the last `to`.
 *   3. Existing projects upgrade lazily on first open.
 */

import type { ProjectState } from "../project-state";

export interface ProjectMigration {
    from: number;
    to: number;
    description: string;
    run: (ydoc: ProjectState) => void;
}

export const PROJECT_MIGRATIONS: ProjectMigration[] = [
    // Example for the next breaking change:
    // {
    //     from: 1,
    //     to: 2,
    //     description: "Move legacy comments from screenplay marks into the comments map",
    //     run: (ydoc) => { ... },
    // },
];

/**
 * Version every project should be at after migration. Legacy projects (no
 * version field in metadata) are treated as version 1, matching the schema
 * shipped before the migration framework existed.
 */
export const LEGACY_PROJECT_VERSION = 1;

export const CURRENT_PROJECT_VERSION =
    PROJECT_MIGRATIONS.length === 0
        ? LEGACY_PROJECT_VERSION
        : PROJECT_MIGRATIONS[PROJECT_MIGRATIONS.length - 1].to;
