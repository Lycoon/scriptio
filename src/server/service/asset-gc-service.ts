/**
 * Server-side cloud asset reconcile.
 *
 * Given the set of asset hashes still referenced (by the live doc + every
 * retained snapshot, computed by the Worker), delete the R2 objects and tracking
 * rows for everything else — grace-window protected so a just-uploaded asset
 * whose card hasn't synced yet isn't reaped. Shared by the user-triggered GC
 * route and the Worker's post-retention callback.
 */

import * as S3 from "@src/lib/s3";
import * as ProjectService from "@src/server/service/project-service";
import { computeAssetOrphans } from "@src/lib/assets/asset-orphans";
import { CLOUD_ASSET_GC_GRACE_MS } from "@src/lib/utils/storage-limits";

/**
 * Delete cloud assets not in `referenced`. No-op when `complete` is false (the
 * reference set couldn't be fully computed — never risk deleting a needed asset).
 * Returns the number of assets reclaimed.
 */
export async function reconcileProjectAssets(
    projectId: string,
    referenced: string[],
    complete: boolean,
): Promise<number> {
    if (!complete) return 0;

    const stored = await ProjectService.listAssetHashes(projectId);
    const orphans = computeAssetOrphans(stored, new Set(referenced), Date.now(), CLOUD_ASSET_GC_GRACE_MS);

    if (orphans.length > 0) {
        await S3.destroyMany(orphans.map((hash) => `assets/${projectId}/${hash}`));
        await ProjectService.deleteAssets(projectId, orphans);
    }

    return orphans.length;
}
