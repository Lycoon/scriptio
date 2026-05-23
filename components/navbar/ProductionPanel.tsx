"use client";

import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Lock, X } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { computeSceneItems } from "@src/lib/screenplay/scenes";
import { unlockScenesPopup } from "@src/lib/screenplay/popup";
import Switch from "@components/utils/Switch";

import styles from "./ProductionPanel.module.css";

interface ProductionPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const REVISION_COLORS = [
    "#ffffff", // white
    "#bbdfff", // blue
    "#ffb6c1", // pink
    "#ffea7a", // yellow
    "#a5d6a7", // green
    "#d4a017", // goldenrod
    "#e0c58b", // buff
    "#fa8072", // salmon
    "#9b1c2a", // cherry
];

const ProductionPanel = ({ isOpen, onClose }: ProductionPanelProps) => {
    const t = useTranslations("production");
    const {
        sceneLocking,
        sceneNumberingStyle,
        skippedSceneLetters,
        persistentScenes,
        scenes,
        repository,
        isReadOnly,
    } = useContext(ProjectContext);
    const userCtx = useContext(UserContext);

    const panelRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onClose]);

    const sceneUuids = useMemo(
        () => scenes.map((s) => s.id).filter((id): id is string => !!id),
        [scenes],
    );

    const labels = useMemo(
        () =>
            sceneLocking
                ? computeSceneLabels(
                      sceneUuids,
                      persistentScenes,
                      sceneNumberingStyle,
                      skippedSceneLetters,
                  )
                : [],
        [sceneLocking, sceneUuids, persistentScenes, sceneNumberingStyle, skippedSceneLetters],
    );

    const provisionalLabels = useMemo(
        () => labels.filter((l) => l.status === "provisional"),
        [labels],
    );

    // Stable across renders: the popup keeps a reference to this callback.
    const performUnlock = useCallback(() => {
        if (!repository) return;
        repository.transact(() => {
            repository.clearSceneLocks();
            repository.setSceneLocking(false);
        });
    }, [repository]);

    const handleSceneLockingToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        if (next) {
            repository.transact(() => {
                const currentScreenplay = repository.screenplay;
                const scenes = computeSceneItems(currentScreenplay);
                const uuids = scenes.map(s => s.id).filter((id): id is string => !!id);

                // Idempotent: any scene that already has a token (e.g. left
                // over from an earlier session, or that survived an unlock
                // in read-only mode) keeps its frozen label. Only scenes
                // computed as provisional by `computeSceneLabels` get a new
                // token written. On a fresh lock-on with no existing
                // tokens, this falls through to baseToken(idx+1) for every
                // scene, matching the previous behaviour.
                const persistentSnapshot = repository.scenes;
                const labels = computeSceneLabels(
                    uuids,
                    persistentSnapshot,
                    sceneNumberingStyle,
                    skippedSceneLetters,
                );

                labels.forEach((label) => {
                    if (label.status === "provisional") {
                        repository.upsertScene(label.uuid, { token: label.token });
                    }
                });

                repository.setSceneLocking(true);
            });
        } else {
            unlockScenesPopup(performUnlock, userCtx);
        }
    };

    const handleRelock = () => {
        if (!repository || isReadOnly) return;
        repository.transact(() => {
            const currentScreenplay = repository.screenplay;
            const scenes = computeSceneItems(currentScreenplay);
            const uuids = scenes.map(s => s.id).filter((id): id is string => !!id);
            
            // Re-read fresh persistent data
            const persistentSnapshot = repository.scenes;

            const currentLabels = computeSceneLabels(
                uuids,
                persistentSnapshot,
                sceneNumberingStyle,
                skippedSceneLetters,
            );

            console.log("[ProductionPanel] RELOCKING PROVISIONAL. Full snapshot:", currentLabels.map(l => ({
                uuid: l.uuid,
                label: l.label,
                status: l.status,
                token: l.token
            })));

            let relockedCount = 0;
            currentLabels.forEach((label) => {
                if (label.status === "provisional") {
                    console.log(`[ProductionPanel] -> Freezing ${label.uuid} as "${label.label}"`);
                    repository.upsertScene(label.uuid, { token: label.token });
                    relockedCount++;
                }
            });

            console.log(`[ProductionPanel] Relock complete. Persisted ${relockedCount} tokens.`);
        });
    };

    if (!isOpen) return null;

    return (
        <div className={styles.container} ref={panelRef}>
            <div className={styles.header}>
                <span className={styles.title}>{t("title")}</span>
                <button className={styles.close_btn} onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>
            </div>

            {/* Scene Locking */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <Lock size={14} className={styles.row_icon} />
                        <span className={styles.row_label}>{t("sceneLocking")}</span>
                    </div>
                    <div className={styles.row_actions}>
                        {sceneLocking && provisionalLabels.length > 0 && (
                            <button
                                type="button"
                                className={styles.relock_btn}
                                onClick={handleRelock}
                                disabled={isReadOnly}
                            >
                                {t("relock")}
                            </button>
                        )}
                        <Switch
                            checked={sceneLocking}
                            onChange={handleSceneLockingToggle}
                            disabled={isReadOnly}
                            ariaLabel={t("sceneLocking")}
                        />
                    </div>
                </div>

                {sceneLocking && provisionalLabels.length > 0 && (
                    <div className={styles.provisional_box}>
                        <div className={styles.provisional_title}>{t("provisionalTitle")}</div>
                        <div className={styles.provisional_list}>
                            {provisionalLabels.map((l, idx) => (
                                <span
                                    key={`${l.uuid}-${idx}`}
                                    className={styles.provisional_label}
                                >
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Page Locking (inert in v1) */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <span className={styles.row_label}>{t("pageLocking")}</span>
                    </div>
                    <Switch checked={false} onChange={() => {}} ariaLabel={t("pageLocking")} />
                </div>
            </div>

            {/* Revisions (inert in v1) */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <span className={styles.row_label}>{t("revisions")}</span>
                    </div>
                    <Switch checked={false} onChange={() => {}} ariaLabel={t("revisions")} />
                </div>
                <div className={styles.swatches}>
                    {REVISION_COLORS.map((color, idx) => (
                        <span
                            key={idx}
                            className={styles.swatch}
                            style={{ backgroundColor: color }}
                            aria-disabled
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductionPanel;
