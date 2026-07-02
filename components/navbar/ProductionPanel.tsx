"use client";

import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, Settings, Info } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { computeSceneLabels } from "@src/lib/screenplay/scene-locking";
import { computeSceneItems } from "@src/lib/screenplay/scenes";
import {
    REVISION_COLORS,
    RevisionDisplayMode,
    nextRevision,
    clampRevision,
    revisionColor,
} from "@src/lib/screenplay/revisions";
import { unlockDraftPopup, unlockPagesPopup, unlockScenesPopup } from "@src/lib/screenplay/popup";
import { getPageAnchors, getPageAnchorInfo } from "@src/lib/screenplay/extensions/pagination-extension";
import Switch from "@components/utils/Switch";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import styles from "./ProductionPanel.module.css";

interface ProductionPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProductionPanel = ({ isOpen, onClose }: ProductionPanelProps) => {
    const t = useTranslations("production");
    const {
        sceneLocking,
        sceneNumberingStyle,
        skippedSceneLetters,
        persistentScenes,
        pageLocking,
        persistentPages,
        revisionsEnabled,
        currentRevision,
        revisionDisplayMode,
        setRevisionsEnabled,
        setCurrentRevision,
        setRevisionDisplayMode,
        scenes,
        screenplay,
        editor,
        repository,
        isReadOnly,
    } = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { openDashboard } = useContext(DashboardContext);

    const panelRef = useRef<HTMLDivElement>(null);

    // Each option is rendered in its own revision colour (CourierPrime), so the
    // list reads like the page-header revision colours. White (the base, index 0)
    // has no revision colour, so it falls back to the readable primary text.
    const revisionOptions: DropdownOption[] = REVISION_COLORS.map((c, i) => ({
        value: c.name,
        label: (
            <span className={styles.revision_option} style={{ color: revisionColor(i) ?? "var(--primary-text)" }}>
                <span className={styles.revision_dot} style={{ backgroundColor: c.value }} />
                {c.name}
            </span>
        ),
    }));

    // The dropdown is keyed by colour name; the persisted value is the index.
    const revisionColorName = REVISION_COLORS[clampRevision(currentRevision)].name;

    // How committed revisions are shown — independent of the stamping toggle.
    const displayModeOptions: DropdownOption[] = [
        { value: "all", label: t("revisionDisplayAll") },
        { value: "hidden", label: t("revisionDisplayHidden") },
        { value: "current", label: t("revisionDisplayCurrent") },
    ];

    const handleDisplayModeChange = (mode: string) => {
        if (!repository || isReadOnly) return;
        setRevisionDisplayMode(mode as RevisionDisplayMode);
    };

    const handleRevisionsToggle = (next: boolean) => {
        if (!repository || isReadOnly) return;
        setRevisionsEnabled(next);
    };

    const handleRevisionColorChange = (name: string) => {
        if (!repository || isReadOnly) return;
        const index = REVISION_COLORS.findIndex((c) => c.name === name);
        if (index >= 0) setCurrentRevision(index);
    };

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
                // Locking a draft issues the next revision: enable tracking and
                // advance to the next colour (see draftLockingHint). Existing
                // marks are kept — revisions are cumulative.
                repository.setRevisionsEnabled(true);
                repository.setCurrentRevision(nextRevision(currentRevision));
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
            // Relocking issues a new revision just like the initial draft lock
            // (see draftLockingHint): enable tracking and advance to the next
            // colour. Existing marks are kept — revisions are cumulative.
            repository.setRevisionsEnabled(true);
            repository.setCurrentRevision(nextRevision(currentRevision));
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
            <div className={styles.section}>
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

            {/* Revision mode (stamping) + how revisions are displayed */}
            <div className={styles.section}>
                <div className={styles.row}>
                    <div className={styles.row_main}>
                        <span className={styles.row_label}>{t("revisions")}</span>
                    </div>
                    <Switch
                        checked={revisionsEnabled}
                        onChange={handleRevisionsToggle}
                        disabled={isReadOnly}
                        ariaLabel={t("revisions")}
                    />
                </div>
                <div className={styles.revision_control}>
                    <span className={styles.revision_control_label}>{t("revisionShowLabel")}</span>
                    <div className={styles.revision_control_field}>
                        <Dropdown
                            value={revisionDisplayMode}
                            onChange={handleDisplayModeChange}
                            options={displayModeOptions}
                            className={styles.revision_select}
                        />
                    </div>
                </div>
                <div
                    className={`${styles.revision_control} ${
                        revisionsEnabled || revisionDisplayMode === "current" ? "" : styles.revision_control_disabled
                    }`}
                    aria-disabled={!(revisionsEnabled || revisionDisplayMode === "current")}
                >
                    <span className={styles.revision_control_label}>{t("revisionDisplayCurrent")}</span>
                    <div className={styles.revision_control_field}>
                        <Dropdown
                            value={revisionColorName}
                            onChange={handleRevisionColorChange}
                            options={revisionOptions}
                            className={styles.revision_select}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionPanel;
