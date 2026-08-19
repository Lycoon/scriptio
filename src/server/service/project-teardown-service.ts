/**
 * Full teardown of a cloud project.
 *
 * A project's bytes live in three places, and none of them reclaim themselves:
 * the Durable Object room (SQLite doc + snapshot index) and its R2 snapshots,
 * the R2 asset objects (board images / audio) plus the poster, and the DB rows.
 * Shared by the project DELETE route and account deletion so both wipe all three.
 */

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import * as CollabUtils from "@src/lib/cloud/utils";

export async function destroyProjectCompletely(projectId: string): Promise<void> {
    // Purge the room first: it holds the live doc and keeps snapshotting on an
    // alarm, so a room left running could re-upload right after we clear R2.
    await CollabUtils.purgeProjectRoom(projectId);

    // Wipe the whole asset folder rather than the hashes the DB knows about —
    // an object whose tracking row was lost would otherwise stay forever.
    await S3.destroyPrefix(`assets/${projectId}/`);

    // The poster lives outside that folder, under its own key. Deleted
    // unconditionally: S3 deletes are idempotent, and a `hasPoster` that drifted
    // false (older builds reset it on any project edit) would otherwise leave
    // the object behind forever.
    await S3.destroy(`poster-${projectId}`);

    // Cascades ProjectMember, ProjectInvitation and ProjectAsset rows.
    await ProjectService.destroy(projectId);
}
