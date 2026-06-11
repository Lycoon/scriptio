"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, BookOpen, Clapperboard, PencilLine, Settings, Info, ChevronDown } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { computeSceneItems } from "@src/lib/screenplay/scenes";
import { unlockDraftPopup, unlockPagesPopup, unlockScenesPopup } from "@src/lib/screenplay/popup";
import { getPageAnchors, getPageAnchorInfo } from "@src/lib/screenplay/extensions/pagination-extension";
import Switch from "@components/utils/Switch";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import styles from "./ProductionPanel.module.css";

interface ProductionPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

// Standard production revision color order. Names stay in English on purpose —
// they're surfaced verbatim in the printed page headers.
const REVISION_COLORS: { name: string; value: string }[] = [
    { name: "White", value: "#ffffff" },
    { name: "Blue", value: "#bbdfff" },
    { name: "Pink", value: "#ffb6c1" },
    { name: "Yellow", value: "#ffea7a" },
    { name: "Green", value: "#a5d6a7" },
    { name: "Goldenrod", value: "#d4a017" },
    { name: "Buff", value: "#e0c58b" },
    { name: "Salmon", value: "#fa8072" },
    { name: "Cherry", value: "#9b1c2a" },
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
    const { openDashboard } = useContext(DashboardContext);

    const panelRef = useRef<HTMLDivElement>(null);

    // Revisions are inert in v1: this only tracks the previewed color locally
    // until revision tracking is wired to the repository.
    const [revisionColor, setRevisionColor] = useState(REVISION_COLORS[0].name);

    // Scene/page/revision controls are tucked under a collapsed "Advanced"
    // section — the draft toggle covers the common case on its own.
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const revisionOptions: DropdownOption[] = REVISION_COLORS.map((c) => ({
        value: c.name,
        label: (
            <span className={styles.revision_option}>
                <span className={styles.revision_dot} style={{ backgroundColor: c.value }} />
                {c.name}
            </span>
        ),
    }));

    const handleOpenSettings = () => {
        onClose();
        openDashboard("Production");
    };

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

    const sceneUuids = useMemo(() => scenes.map((s) => s.id).filter((id): id is string => !!id), [scenes]);

    const labels = useMemo(
        () =>
            sceneLocking
                ? computeSceneLabels(sceneUuids, persistentScenes, sceneNumberingStyle, skippedSceneLetters)
                : [],
        [sceneLocking, sceneUuids, persistentScenes, sceneNumberingStyle, skippedSceneLetters],
    );

    const provisionalLabels = useMemo(() => labels.filter((l) => l.status === "provisional"), [labels]);

    // Stable across renders: the popup keeps a reference to this callback.
    const performUnlock = useCallback(() => {
        if (!repository) return;
        repository.transact(() => {
            repository.clearSceneLocks();
            repository.setSceneLocking(false);
        });
    }, [repository]);

    // Writes-only scene relock: assigns a frozen token to every scene that
    // `computeSceneLabels` reports as provisional. Idempotent — scenes that
    // already hold a token keep it. Must be called inside `repository.transact`
    // so it can be composed with the page writes for a combined draft lock.
    const relockScenesWrites = useCallback(() => {
        if (!repository) return;
        const currentScreenplay = repository.screenplay;
        const scenes = computeSceneItems(currentScreenplay);
        const uuids = scenes.map((s) => s.id).filter((id): id is string => !!id);

        // Re-read fresh persistent data
        const persistentSnapshot = repository.scenes;

        const currentLabels = computeSceneLabels(uuids, persistentSnapshot, sceneNumberingStyle, skippedSceneLetters);

        currentLabels.forEach((label) => {
            if (label.status === "provisional") {
                repository.upsertScene(label.uuid, { token: label.token });
            }
        });
    }, [repository, sceneNumberingStyle, skippedSceneLetters]);

    // Lock = freeze the current provisional tokens, then flip the flag on.
    const lockScenesWrites = useCallback(() => {
        if (!repository) return;
        relockScenesWrites();
        repository.setSceneLocking(true);
    }, [repository, relockScenesWrites]);

    const handleSceneLockingToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        if (next) {
            repository.transact(() => {
                lockScenesWrites();
            });
        } else {
            unlockScenesPopup(performUnlock, userCtx);
        }
    };

    const handleRelock = () => {
        if (!repository || isReadOnly) return;
        repository.transact(() => {
            relockScenesWrites();
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

    const provisionalPageLabels = useMemo(() => pageLabels.filter((l) => l.status === "provisional"), [pageLabels]);

    const performPageUnlock = useCallback(() => {
        if (!repository) return;
        repository.transact(() => {
            repository.clearPageLocks();
            repository.setPageLocking(false);
        });
    }, [repository]);

    // Writes-only page relock. Idempotent: any anchor that already has a token
    // keeps it; only provisional anchors (no token yet) get a freshly-computed
    // one. splitOffset is captured alongside the token so the pagination plugin
    // can reproduce mid-node splits (straddling dialogues) on recompute instead
    // of force-pushing the whole anchor node forward. Must be called inside
    // `repository.transact`.
    const relockPagesWrites = useCallback(() => {
        if (!repository || !editor) return;
        const anchorInfos = getPageAnchorInfo(editor);
        const anchors = anchorInfos.map((a) => a.anchorId);
        const persistentSnapshot = repository.pages;
        const currentLabels = computeSceneLabels(anchors, persistentSnapshot, "suffix", skippedSceneLetters);
        currentLabels.forEach((label, idx) => {
            if (label.status === "provisional") {
                repository.upsertPage(label.uuid, {
                    token: label.token,
                    splitOffset: anchorInfos[idx]?.splitOffset,
                });
            }
        });
    }, [repository, editor, skippedSceneLetters]);

    const lockPagesWrites = useCallback(() => {
        if (!repository || !editor) return;
        relockPagesWrites();
        repository.setPageLocking(true);
    }, [repository, editor, relockPagesWrites]);

    const handlePageLockingToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        if (next) {
            if (!editor) return;
            repository.transact(() => {
                lockPagesWrites();
            });
        } else {
            unlockPagesPopup(performPageUnlock, userCtx);
        }
    };

    const handlePageRelock = () => {
        if (!repository || isReadOnly || !editor) return;
        repository.transact(() => {
            relockPagesWrites();
        });
    };

    // -------------- Draft locking (scenes + pages together) --------------
    // The draft toggle reflects whether *everything* is locked. Turning it on
    // locks scenes and pages in a single transaction (each write is idempotent,
    // so a partially-locked draft is brought fully in line); turning it off
    // clears both via one confirmation popup.
    const draftLocking = sceneLocking && pageLocking;

    const hasProvisionalDraft =
        (sceneLocking && provisionalLabels.length > 0) || (pageLocking && provisionalPageLabels.length > 0);

    const performDraftUnlock = useCallback(() => {
        if (!repository) return;
        repository.transact(() => {
            repository.clearSceneLocks();
            repository.setSceneLocking(false);
            repository.clearPageLocks();
            repository.setPageLocking(false);
        });
    }, [repository]);

    const handleDraftLockingToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        if (next) {
            if (!editor) return;
            repository.transact(() => {
                lockScenesWrites();
                lockPagesWrites();
            });
        } else {
            unlockDraftPopup(performDraftUnlock, userCtx);
        }
    };

    const handleDraftRelock = () => {
        if (!repository || isReadOnly) return;
        repository.transact(() => {
            if (sceneLocking) relockScenesWrites();
            if (pageLocking) relockPagesWrites();
        });
    };

    if (!isOpen) return null;

    return (
        <div className={styles.container} ref={panelRef}>
            <div className={styles.header}>
                <span className={styles.title}>{t("title")}</span>
                <div className={styles.header_actions}>
                    <button
                        className={styles.close_btn}
                        onClick={handleOpenSettings}
                        aria-label={t("settings")}
                        title={t("settings")}
                    >
                        <Settings size={16} />
                    </button>
                    <button className={styles.close_btn} onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Draft Locking (scenes + pages together) */}
            <div className={`${styles.section} ${styles.section_flush}`}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <span className={styles.row_label}>{t("draftLocking")}</span>
                        <span className={styles.hint} tabIndex={0}>
                            <Info size={14} className={styles.hint_icon} />
                            <span className={styles.hint_popover} role="tooltip">
                                {t("draftLockingHint")}
                            </span>
                        </span>
                    </div>
                    <div className={styles.row_actions}>
                        {draftLocking && hasProvisionalDraft && (
                            <button
                                type="button"
                                className={styles.relock_btn}
                                onClick={handleDraftRelock}
                                disabled={isReadOnly}
                            >
                                {t("draftRelock")}
                            </button>
                        )}
                        <Switch
                            checked={draftLocking}
                            onChange={handleDraftLockingToggle}
                            disabled={isReadOnly}
                            ariaLabel={t("draftLocking")}
                        />
                    </div>
                </div>
            </div>

            {/* Advanced — a labeled separator that folds the scene/page/revision
                controls. The label sits on the divider line under Draft locking. */}
            <button
                type="button"
                className={styles.advanced_divider}
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
            >
                <span className={styles.advanced_divider_label}>
                    {t("advanced")}
                    <ChevronDown
                        size={13}
                        className={`${styles.advanced_chevron} ${advancedOpen ? styles.advanced_chevron_open : ""}`}
                    />
                </span>
            </button>

            {advancedOpen && (
                <>
            {/* Scene Locking */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
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
                                <span key={`${l.uuid}-${idx}`} className={styles.provisional_label}>
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
                                <span key={`${l.uuid}-${idx}`} className={styles.provisional_label}>
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
                <Dropdown
                    value={revisionColor}
                    onChange={setRevisionColor}
                    options={revisionOptions}
                    className={styles.revision_select}
                />
            </div>
                </>
            )}
        </div>
    );
};

export default ProductionPanel;
