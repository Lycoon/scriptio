/**
 * Bringing a project file's assets back into local storage.
 *
 * Shared by the two callers that need it — the bound writer merging a file that
 * changed underneath it, and the open flow taking in a file the user handed us
 * — because they differ only in where the bytes come from, and the rule they
 * both follow is the same one.
 *
 * That rule is content addressing: a hash names its own bytes, so an asset the
 * store already holds is *by definition* the asset in the file, and there is
 * nothing to compare and nothing to fetch. A file that shares most of its images
 * with the local project therefore reads only the ones this machine has never
 * seen — which is what keeps opening a copy of a large project cheap.
 */

import { getStorageProvider } from "../storage-provider/storage-provider";
import { readAssetBytes, type ProjectFile, type ReadRange } from "./reader";

export async function restoreAssetsInto(
    projectId: string,
    read: ReadRange,
    file: ProjectFile,
): Promise<void> {
    const provider = await getStorageProvider();

    // One listing, not a lookup per asset: the common case is a file that shares
    // most of its images with us, so asking about each in turn would be a
    // thousand round trips to learn "already have it" a thousand times.
    const held = new Set(await provider.listAssetHashes(projectId));

    for (const [hash, record] of file.index.assets) {
        if (held.has(hash)) continue;

        const bytes = await readAssetBytes(read, file, hash);
        if (!bytes) continue;

        await provider.putAsset({
            key: `${projectId}/${hash}`,
            projectId,
            hash,
            mime: record.mime,
            size: record.size,
            width: record.w,
            height: record.h,
            data: bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
            createdAt: Date.now(),
        });
    }
}
