"use client";

import { RefObject, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardContext } from "@src/context/DashboardContext";
import { useCookieUser, useDismissOnOutsidePress, useFormatTimestamp } from "@src/lib/utils/hooks";
import {
    X,
    Save,
    RotateCcw,
    Pencil,
    Trash2,
    Clock,
    Bookmark,
    Loader2,
    Lock,
} from "lucide-react";
import type { SavesProvider } from "@src/lib/saves/saves-provider";
import type { SaveEntry } from "@src/lib/saves/types";

import styles from "./SavesPanel.module.css";

interface SavesPanelProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    isPro: boolean;
    /** The navbar button that toggles this panel — see useDismissOnOutsidePress. */
    triggerRef?: RefObject<HTMLElement | null>;
}

/**
 * Which history this project has, once we've looked.
 *
 * Resolved from the project's storage target rather than from the `isPro` /
 * membership props the navbar already holds: those describe the *user*, and the
 * question here is where the versions are kept. A local-only project's history
 * lives on this device, costs nothing to keep, and is free; a cloud project's
 * lives in R2 and stays behind the Pro gate.
 */
type SavesMode = "loading" | "cloud" | "local";

const SavesPanel = ({ projectId, isOpen, onClose, isPro, triggerRef }: SavesPanelProps) => {
    const t = useTranslations("saves");
    const { openDashboard } = useContext(DashboardContext);
    const { user } = useCookieUser();
    const isSignedIn = !!user;
    const formatDate = useFormatTimestamp();

    const handleUpgrade = () => {
        onClose();
        openDashboard(isSignedIn ? "Subscription" : "Auth", { fromMenu: true });
    };

    const [mode, setMode] = useState<SavesMode>("loading");
    const [provider, setProvider] = useState<SavesProvider | null>(null);
    const [saves, setSaves] = useState<SaveEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [showNameInput, setShowNameInput] = useState(false);
    const [confirmRestoreKey, setConfirmRestoreKey] = useState<string | null>(null);
    const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const panelRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    const manualSaves = saves.filter((s) => s.type === "manual");
    const autoSaves = saves.filter((s) => s.type === "auto");

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (prevIsOpen !== isOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen) {
            setShowNameInput(false);
            setSaveName("");
            setConfirmRestoreKey(null);
            setConfirmDeleteKey(null);
            setEditingKey(null);
        }
    }

    // Resolve the storage target before rendering anything that depends on it —
    // the panel would otherwise flash the upgrade gate at a local project while
    // the lookup is in flight.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [{ isCloudSyncedProject }, { getSavesProvider }] = await Promise.all([
                import("@src/lib/persistence/storage-provider/local-persistence"),
                import("@src/lib/saves/saves-provider"),
            ]);
            const isCloud = await isCloudSyncedProject(projectId);
            const resolved = await getSavesProvider(projectId);
            if (cancelled) return;
            setMode(isCloud ? "cloud" : "local");
            setProvider(resolved);
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    useEffect(() => {
        if (!isOpen || !provider) return;
        let cancelled = false;
        const fetchSaves = async () => {
            setLoading(true);
            const data = await provider.list(projectId);
            if (cancelled) return;
            setSaves(data);
            setLoading(false);
        };
        fetchSaves();
        return () => {
            cancelled = true;
        };
    }, [isOpen, projectId, provider]);

    // Focus name input when shown
    useEffect(() => {
        if (showNameInput && nameInputRef.current) {
            nameInputRef.current.focus();
        }
    }, [showNameInput]);

    // Focus edit input when editing
    useEffect(() => {
        if (editingKey && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingKey]);

    // Click outside to close — the navbar trigger excepted, so re-tapping it
    // dismisses the panel instead of closing and re-opening it.
    useDismissOnOutsidePress(isOpen, onClose, panelRef, triggerRef);

    // Create manual save
    const handleCreate = async () => {
        if (!saveName.trim() || !provider) return;
        setIsCreating(true);
        const entry = await provider.createManual(projectId, saveName.trim());
        if (entry) {
            setSaves((prev) => [entry, ...prev]);
        }
        setSaveName("");
        setShowNameInput(false);
        setIsCreating(false);
    };

    // Restore. Both sides reload the page from here — the cloud by closing every
    // client socket, the local one on its own — so there is no list to update.
    const handleRestore = async (key: string) => {
        if (!provider) return;
        await provider.restore(projectId, key);
        setConfirmRestoreKey(null);
    };

    // Rename
    const handleRename = async (key: string) => {
        if (!editName.trim() || !provider) return;
        await provider.renameManual(projectId, key, editName.trim());
        setSaves((prev) =>
            prev.map((s) => (s.key === key ? { ...s, name: editName.trim() } : s))
        );
        setEditingKey(null);
        setEditName("");
    };

    // Delete
    const handleDelete = async (key: string) => {
        if (!provider) return;
        await provider.remove(projectId, key);
        setSaves((prev) => prev.filter((s) => s.key !== key));
        setConfirmDeleteKey(null);
    };

    // "for all collaborators" is a promise a device-local history cannot make and
    // does not need to: nobody else can see this project.
    const confirmRestoreText = mode === "local" ? t("confirmRestoreLocal") : t("confirmRestore");

    const formatFullDate = (iso: string) => {
        return new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (!isOpen) return null;

    if (mode === "cloud" && !isPro) {
        return (
            <div className={styles.container} ref={panelRef}>
                <div className={styles.header}>
                    <span className={styles.title}>{t("title")}</span>
                    <button className={styles.close_btn} onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
                <div className={styles.pro_gate}>
                    <Lock size={20} />
                    <p className={styles.pro_gate_title}>{t("proRequired")}</p>
                    <p className={styles.pro_gate_desc}>{t("proRequiredDesc")}</p>
                    <button className={styles.pro_gate_btn} onClick={handleUpgrade}>
                        {isSignedIn ? t("upgradeBtn") : t("signInAndUpgrade")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} ref={panelRef}>
            {/* Header */}
            <div className={styles.header}>
                <span className={styles.title}>{t("title")}</span>
                <button className={styles.close_btn} onClick={onClose}>
                    <X size={16} />
                </button>
            </div>

            {/* Create manual save */}
            <div className={styles.create_section}>
                {showNameInput ? (
                    <div className={styles.name_input_row}>
                        <input
                            ref={nameInputRef}
                            type="text"
                            className={styles.name_input}
                            placeholder={t("namePlaceholder")}
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate();
                                if (e.key === "Escape") setShowNameInput(false);
                            }}
                            disabled={isCreating}
                        />
                        <button
                            className={styles.save_btn}
                            onClick={handleCreate}
                            disabled={!saveName.trim() || isCreating}
                        >
                            {isCreating ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />}
                        </button>
                    </div>
                ) : (
                    <button
                        className={styles.create_btn}
                        onClick={() => setShowNameInput(true)}
                        disabled={!provider}
                    >
                        <Save size={14} />
                        {t("saveCurrentVersion")}
                    </button>
                )}
                {mode === "local" && <p className={styles.device_hint}>{t("deviceOnlyHint")}</p>}
            </div>

            {/* Saves list */}
            <div className={styles.list}>
                {loading || mode === "loading" ? (
                    <div className={styles.loading}>
                        <Loader2 size={20} className={styles.spinner} />
                    </div>
                ) : (
                    <>
                        {/* Manual saves section */}
                        {manualSaves.length > 0 && (
                            <div className={styles.section}>
                                <div className={styles.section_label}>
                                    <Bookmark size={12} />
                                    {t("manualSaves")}
                                </div>
                                {manualSaves.map((save) => (
                                    <div key={save.key} className={styles.item}>
                                        {editingKey === save.key ? (
                                            <div className={styles.name_input_row}>
                                                <input
                                                    ref={editInputRef}
                                                    type="text"
                                                    className={styles.name_input}
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleRename(save.key);
                                                        if (e.key === "Escape") setEditingKey(null);
                                                    }}
                                                    onBlur={() => handleRename(save.key)}
                                                />
                                            </div>
                                        ) : confirmRestoreKey === save.key ? (
                                            <div className={styles.confirm_row}>
                                                <span className={styles.confirm_text}>{confirmRestoreText}</span>
                                                <div className={styles.confirm_btns}>
                                                    <button
                                                        className={styles.confirm_yes}
                                                        onClick={() => handleRestore(save.key)}
                                                    >
                                                        {t("restore")}
                                                    </button>
                                                    <button
                                                        className={styles.confirm_no}
                                                        onClick={() => setConfirmRestoreKey(null)}
                                                    >
                                                        {t("cancel")}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : confirmDeleteKey === save.key ? (
                                            <div className={styles.confirm_row}>
                                                <span className={styles.confirm_text}>{t("confirmDelete")}</span>
                                                <div className={styles.confirm_btns}>
                                                    <button
                                                        className={styles.confirm_yes_danger}
                                                        onClick={() => handleDelete(save.key)}
                                                    >
                                                        {t("delete")}
                                                    </button>
                                                    <button
                                                        className={styles.confirm_no}
                                                        onClick={() => setConfirmDeleteKey(null)}
                                                    >
                                                        {t("cancel")}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.item_info}>
                                                    <span className={styles.item_name}>{save.name}</span>
                                                    <span className={styles.item_date} title={formatFullDate(save.date)}>
                                                        {formatDate(save.date)}
                                                    </span>
                                                </div>
                                                <div className={styles.item_actions}>
                                                    <button
                                                        className={styles.action_btn}
                                                        onClick={() => setConfirmRestoreKey(save.key)}
                                                        title={t("restore")}
                                                    >
                                                        <RotateCcw size={13} />
                                                    </button>
                                                    <button
                                                        className={styles.action_btn}
                                                        onClick={() => { setEditingKey(save.key); setEditName(save.name || ""); }}
                                                        title={t("rename")}
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        className={`${styles.action_btn} ${styles.action_btn_danger}`}
                                                        onClick={() => setConfirmDeleteKey(save.key)}
                                                        title={t("delete")}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Auto-saves section */}
                        {autoSaves.length > 0 && (
                            <div className={styles.section}>
                                <div className={styles.section_label}>
                                    <Clock size={12} />
                                    {t("autoSaves")}
                                </div>
                                {autoSaves.map((save) => (
                                    <div key={save.key} className={styles.item}>
                                        {confirmRestoreKey === save.key ? (
                                            <div className={styles.confirm_row}>
                                                <span className={styles.confirm_text}>{confirmRestoreText}</span>
                                                <div className={styles.confirm_btns}>
                                                    <button
                                                        className={styles.confirm_yes}
                                                        onClick={() => handleRestore(save.key)}
                                                    >
                                                        {t("restore")}
                                                    </button>
                                                    <button
                                                        className={styles.confirm_no}
                                                        onClick={() => setConfirmRestoreKey(null)}
                                                    >
                                                        {t("cancel")}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.item_info}>
                                                    <span className={styles.item_date_main} title={formatFullDate(save.date)}>
                                                        {formatFullDate(save.date)}
                                                    </span>
                                                    <span className={styles.item_date}>
                                                        {formatDate(save.date)}
                                                    </span>
                                                </div>
                                                <button
                                                    className={styles.action_btn}
                                                    onClick={() => setConfirmRestoreKey(save.key)}
                                                    title={t("restore")}
                                                >
                                                    <RotateCcw size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Empty state */}
                        {saves.length === 0 && !loading && (
                            <div className={styles.empty}>{t("noSaves")}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default SavesPanel;
