"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Image as ImageIcon, Music, Trash2, X } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { listInUseAssets, type ProjectAssetInfo } from "@src/lib/assets/asset-store";
import { useAssetUrl } from "@src/lib/assets/use-asset-url";
import { USER_STORAGE_QUOTA_BYTES } from "@src/lib/utils/storage-limits";
import type { BoardArrowData, BoardCardData } from "@src/lib/project/project-doc";

import sharedStyles from "./ProjectSettings.module.css";
import form from "./../../utils/Form.module.css";
import styles from "./StorageSettings.module.css";

/** Human-readable byte size, e.g. 1.4 GB. */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Owner-shared storage split into this project, the owner's other projects, and free. */
interface StorageBreakdown {
    thisUsed: number;
    otherUsed: number;
    quota: number;
}

const emptyBreakdown = (): StorageBreakdown => ({
    thisUsed: 0,
    otherUsed: 0,
    quota: USER_STORAGE_QUOTA_BYTES,
});

/** Last fetched breakdown (tagged with its project id), so re-opening the section
 *  shows the previous figures immediately and the bar never shifts layout. */
let cachedBreakdown: { projectId: string; breakdown: StorageBreakdown } | null = null;

const AssetRow = ({
    projectId,
    asset,
    readOnly,
    onDelete,
}: {
    projectId: string;
    asset: ProjectAssetInfo;
    readOnly: boolean;
    onDelete: (hash: string) => void;
}) => {
    const t = useTranslations("storage");
    const isImage = asset.mime.startsWith("image/");
    const url = useAssetUrl(projectId, isImage ? asset.hash : null);
    const [confirming, setConfirming] = useState(false);

    const dims = isImage && asset.width && asset.height ? `${asset.width}×${asset.height}` : null;

    return (
        <div className={styles.row}>
            <div className={styles.thumb}>
                {isImage ? (
                    url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className={styles.thumbImg} />
                    ) : (
                        <ImageIcon size={18} />
                    )
                ) : (
                    <Music size={18} />
                )}
            </div>
            <div className={styles.meta}>
                <span className={styles.metaTitle}>{isImage ? t("image") : t("audio")}</span>
                <span className={styles.metaSub}>
                    {dims ? `${dims} · ${formatBytes(asset.size)}` : formatBytes(asset.size)}
                </span>
            </div>

            {!readOnly &&
                (confirming ? (
                    <div className={styles.confirm}>
                        <button
                            className={styles.confirmBtn}
                            onClick={() => onDelete(asset.hash)}
                            aria-label={t("confirm")}
                        >
                            <Check size={16} />
                        </button>
                        <button
                            className={styles.cancelBtn}
                            onClick={() => setConfirming(false)}
                            aria-label={t("cancel")}
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <button
                        className={styles.deleteBtn}
                        onClick={() => setConfirming(true)}
                        aria-label={t("remove")}
                    >
                        <Trash2 size={16} />
                    </button>
                ))}
        </div>
    );
};

const StorageBar = ({ breakdown, isLocalOnly }: { breakdown: StorageBreakdown; isLocalOnly: boolean }) => {
    const t = useTranslations("storage");
    const { thisUsed, otherUsed, quota } = breakdown;
    const used = thisUsed + otherUsed;
    const free = Math.max(0, quota - used);

    const thisPct = quota > 0 ? Math.min(100, (thisUsed / quota) * 100) : 0;
    const otherPct = quota > 0 ? Math.min(100 - thisPct, (otherUsed / quota) * 100) : 0;

    return (
        <div className={styles.storageSummary}>
            <div className={styles.storageHeader}>
                <span className={form.label}>{t("sharedStorage")}</span>
                <span className={styles.storageUsed}>
                    {formatBytes(used)} / {formatBytes(quota)}
                </span>
            </div>

            <div className={styles.bar}>
                <div className={`${styles.barSeg} ${styles.segThis}`} style={{ width: `${thisPct}%` }} />
                <div className={`${styles.barSeg} ${styles.segOther}`} style={{ width: `${otherPct}%` }} />
            </div>

            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.dotThis}`} />
                    {t("thisProject")}
                    <span className={styles.legendValue}>{formatBytes(thisUsed)}</span>
                </span>
                <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.dotOther}`} />
                    {t("otherProjects")}
                    <span className={styles.legendValue}>{formatBytes(otherUsed)}</span>
                </span>
                <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.dotFree}`} />
                    {t("free")}
                    <span className={styles.legendValue}>{formatBytes(free)}</span>
                </span>
            </div>

            {isLocalOnly && <p className={sharedStyles.helpText}>{t("localNote")}</p>}
        </div>
    );
};

const StorageSettings = () => {
    const t = useTranslations("storage");
    const { projectId, repository, isReadOnly } = useContext(ProjectContext);
    const { isLocalOnly } = useProjectMembership();
    const [assets, setAssets] = useState<ProjectAssetInfo[] | null>(null);
    // Seed from the cache so the bar shows last-known figures immediately (and at a
    // stable size); fetched values refresh it in place without shifting layout.
    const [breakdown, setBreakdown] = useState<StorageBreakdown>(() =>
        cachedBreakdown?.projectId === projectId ? cachedBreakdown.breakdown : emptyBreakdown(),
    );

    const load = useCallback(async () => {
        if (!projectId || !repository) {
            setAssets([]);
            setBreakdown(emptyBreakdown());
            return;
        }

        const list = await listInUseAssets(projectId, repository.getState());
        list.sort((a, b) => b.size - a.size);
        setAssets(list);

        const { fetchProjectStorage, fetchMyStorage } = await import("@src/lib/assets/cloud-asset-sync");
        let bd: StorageBreakdown;
        if (isLocalOnly) {
            // Not synced: this project's usage is local; "other" is the owner's
            // current cloud usage (this project would add on top once synced).
            const localTotal = list.reduce((sum, a) => sum + a.size, 0);
            const my = await fetchMyStorage();
            bd = { thisUsed: localTotal, otherUsed: my?.used ?? 0, quota: my?.quota ?? USER_STORAGE_QUOTA_BYTES };
        } else {
            const s = await fetchProjectStorage(projectId);
            bd = s
                ? { thisUsed: s.projectUsed, otherUsed: Math.max(0, s.ownerTotalUsed - s.projectUsed), quota: s.quota }
                : emptyBreakdown();
        }
        cachedBreakdown = { projectId, breakdown: bd };
        setBreakdown(bd);
    }, [projectId, repository, isLocalOnly]);

    useEffect(() => {
        void load();
    }, [load]);

    const deleteAsset = useCallback(
        async (hash: string) => {
            if (!projectId || !repository) return;
            const ydoc = repository.getState();

            // Remove every board card (and dangling arrow) referencing the asset.
            ydoc.transact(() => {
                ydoc.documents().forEach((node) => {
                    if (node.type !== "board") return;
                    const map = ydoc.boardData(node.id);
                    const rawCards = map.get("cards");
                    if (!rawCards) return;
                    let cards: BoardCardData[];
                    try {
                        cards = JSON.parse(rawCards);
                    } catch {
                        return;
                    }
                    const removed = new Set(cards.filter((c) => c.assetId === hash).map((c) => c.id));
                    if (removed.size === 0) return;
                    map.set("cards", JSON.stringify(cards.filter((c) => !removed.has(c.id))));

                    const rawArrows = map.get("arrows");
                    if (!rawArrows) return;
                    try {
                        const arrows = JSON.parse(rawArrows) as BoardArrowData[];
                        const next = arrows.filter(
                            (a) => !removed.has(a.fromCardId) && !removed.has(a.toCardId),
                        );
                        if (next.length !== arrows.length) map.set("arrows", JSON.stringify(next));
                    } catch {
                        // leave arrows untouched if unparseable
                    }
                });
            });

            // Reclaim the now-orphaned bytes (local immediately; cloud follows the
            // snapshot-aware GC rules) and refresh.
            const { gcProjectAssets } = await import("@src/lib/assets/asset-gc");
            await gcProjectAssets(projectId, ydoc).catch(() => {});
            await load();
        },
        [projectId, repository, load],
    );

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <StorageBar breakdown={breakdown} isLocalOnly={isLocalOnly} />
                <p className={sharedStyles.helpText}>{t("description")}</p>
            </div>

            {assets === null ? null : assets.length === 0 ? (
                <p className={styles.empty}>{t("empty")}</p>
            ) : (
                <div className={styles.list}>
                    {assets.map((asset) => (
                        <AssetRow
                            key={asset.hash}
                            projectId={projectId}
                            asset={asset}
                            readOnly={isReadOnly}
                            onDelete={deleteAsset}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default StorageSettings;
