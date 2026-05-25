"use client";

import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Lock, X, Layers } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { computeSceneItems } from "@src/lib/screenplay/scenes";
import { unlockPagesPopup, unlockScenesPopup } from "@src/lib/screenplay/popup";
import { getPageAnchors } from "@src/lib/screenplay/extensions/pagination-extension";
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
        pageLocking,
        persistentPages,
        scenes,
        screenplay,
        editor,
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

            currentLabels.forEach((label) => {
                if (label.status === "provisional") {
                    repository.upsertScene(label.uuid, { token: label.token });
                }
            });
        });
    };

    // -------------- Page locking --------------
    // Pulls anchors from the live pagination state; recomputed whenever the
    // screenplay or the persistent maps change. Each render is cheap (a single
    // Set traversal over the plugin state); we don't subscribe to pagination
    // events because the production panel is only meaningful as a snapshot
    // when the user opens it.
    const pageAnchors = useMemo(() => {
        if (!editor) return [];
        return getPageAnchors(editor);
        // `screenplay` and `persistentPages` are listed so the memo refreshes
        // when content/locks change — they're not used inside the body.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, screenplay, persistentPages, persistentScenes]);

    const pageLabels = useMemo(() => {
        if (!pageLocking || pageAnchors.length === 0) return [];
        return computeSceneLabels(pageAnchors, persistentPages, "suffix", skippedSceneLetters);
    }, [pageLocking, pageAnchors, persistentPages, skippedSceneLetters]);

    const provisionalPageLabels = useMemo(
        () => pageLabels.filter((l) => l.status === "provisional"),
        [pageLabels],
    );

    const performPageUnlock = useCallback(() => {
        if (!repository) return;
        repository.transact(() => {
            repository.clearPageLocks();
            repository.setPageLocking(false);
        });
    }, [repository]);

    const handlePageLockingToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        if (next) {
            if (!editor) return;
            repository.transact(() => {
                const anchors = getPageAnchors(editor);
                const persistentSnapshot = repository.pages;
                // Idempotent: any anchor that already has a token keeps it.
                // Only provisional anchors (no token yet) get a freshly-computed
                // one. A fresh lock-on with no existing tokens assigns every
                // page baseToken(idx+1) — same shape as scene locking.
                const computed = computeSceneLabels(
                    anchors,
                    persistentSnapshot,
                    "suffix",
                    skippedSceneLetters,
                );
                computed.forEach((label) => {
                    if (label.status === "provisional") {
                        repository.upsertPage(label.uuid, { token: label.token });
                    }
                });
                repository.setPageLocking(true);
            });
        } else {
            unlockPagesPopup(performPageUnlock, userCtx);
        }
    };

    const handlePageRelock = () => {
        if (!repository || isReadOnly || !editor) return;
        repository.transact(() => {
            const anchors = getPageAnchors(editor);
            const persistentSnapshot = repository.pages;
            const currentLabels = computeSceneLabels(
                anchors,
                persistentSnapshot,
                "suffix",
                skippedSceneLetters,
            );
            currentLabels.forEach((label) => {
                if (label.status === "provisional") {
                    repository.upsertPage(label.uuid, { token: label.token });
                }
            });
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

            {/* Page Locking */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <Layers size={14} className={styles.row_icon} />
                        <span className={styles.row_label}>{t("pageLocking")}</span>
                    </div>
                    <div className={styles.row_actions}>
                        {pageLocking && provisionalPageLabels.length > 0 && (
                            <button
                                type="button"
                                className={styles.relock_btn}
                                onClick={handlePageRelock}
                                disabled={isReadOnly}
                            >
                                {t("pageRelock")}
                            </button>
                        )}
                        <Switch
                            checked={pageLocking}
                            onChange={handlePageLockingToggle}
                            disabled={isReadOnly}
                            ariaLabel={t("pageLocking")}
                        />
                    </div>
                </div>

                {pageLocking && provisionalPageLabels.length > 0 && (
                    <div className={styles.provisional_box}>
                        <div className={styles.provisional_title}>{t("pageProvisionalTitle")}</div>
                        <div className={styles.provisional_list}>
                            {provisionalPageLabels.map((l, idx) => (
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
