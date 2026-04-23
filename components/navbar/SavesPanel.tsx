"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import {
    listSaves,
    createManualSave,
    restoreSave,
    renameManualSave,
    deleteSave,
    SaveEntry,
} from "@src/lib/utils/requests";

import styles from "./SavesPanel.module.css";

interface SavesPanelProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    isPro: boolean;
}

const SavesPanel = ({ projectId, isOpen, onClose, isPro }: SavesPanelProps) => {
    const t = useTranslations("saves");
    const tDates = useTranslations("dates");

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

    useEffect(() => {
        if (!isOpen) return;
        const fetchSaves = async () => {
            setLoading(true);
            const data = await listSaves(projectId);
            setSaves(data);
            setLoading(false);
        };
        fetchSaves();
    }, [isOpen, projectId]);

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

    // Click outside to close panel
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

    // Create manual save
    const handleCreate = async () => {
        if (!saveName.trim()) return;
        setIsCreating(true);
        const entry = await createManualSave(projectId, saveName.trim());
        if (entry) {
            setSaves((prev) => [entry, ...prev]);
        }
        setSaveName("");
        setShowNameInput(false);
        setIsCreating(false);
    };

    // Restore
    const handleRestore = async (key: string) => {
        await restoreSave(projectId, key);
        setConfirmRestoreKey(null);
    };

    // Rename
    const handleRename = async (key: string) => {
        if (!editName.trim()) return;
        await renameManualSave(projectId, key, editName.trim());
        setSaves((prev) =>
            prev.map((s) => (s.key === key ? { ...s, name: editName.trim() } : s))
        );
        setEditingKey(null);
        setEditName("");
    };

    // Delete
    const handleDelete = async (key: string) => {
        await deleteSave(projectId, key);
        setSaves((prev) => prev.filter((s) => s.key !== key));
        setConfirmDeleteKey(null);
    };

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return tDates("justNow");
        if (diffMins < 60) return tDates("minutesAgo", { mins: diffMins });
        if (diffHours < 24) return tDates("hoursAgo", { hours: diffHours });
        if (diffDays < 7) return tDates("daysAgo", { days: diffDays });

        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });
    };

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

    if (!isPro) {
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
                    <Link href="/?settings=Profile" className={styles.pro_gate_btn}>
                        {t("upgradeBtn")}
                    </Link>
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
                    >
                        <Save size={14} />
                        {t("saveCurrentVersion")}
                    </button>
                )}
            </div>

            {/* Saves list */}
            <div className={styles.list}>
                {loading ? (
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
                                                <span className={styles.confirm_text}>{t("confirmRestore")}</span>
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
                                                <span className={styles.confirm_text}>{t("confirmRestore")}</span>
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
