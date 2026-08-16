"use client";

import { deleteProject, transferProjectOwnership } from "@src/lib/utils/requests";
import { useCookieUser, useProjectCollaborators, useProjectMembership } from "@src/lib/utils/hooks";
import { useAppNavigation } from "@src/lib/utils/navigation";
import { useContext, useEffect, useMemo, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { ProjectRole } from "@src/generated/client/browser";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { Trash2, UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";

import styles from "./DangerZone.module.css";
import modal from "../../utils/ModalBtn.module.css";
import form from "../../utils/Form.module.css";
import collaborators from "./CollaboratorsSettings.module.css";

interface DangerZoneProps {
    projectId: string | null;
    isLocalOnly: boolean;
    isOpen: boolean;
}

const DangerZone = ({ projectId, isLocalOnly, isOpen }: DangerZoneProps) => {
    const { membership, mutate: mutateMembership } = useProjectMembership();
    const { closeDashboard } = useContext(DashboardContext);
    const { goToProjects } = useAppNavigation();
    const { user } = useCookieUser();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [transferTargetId, setTransferTargetId] = useState("");
    const [transferError, setTransferError] = useState<string | null>(null);
    const [transferLoading, setTransferLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const t = useTranslations("dangerZone");
    const tCommon = useTranslations("common");

    const isOwner = membership?.role === ProjectRole.OWNER;
    // Only fetched while the transfer row can actually be used — the danger zone
    // stays mounted behind the other dashboard panels.
    const { collaborators: members, mutate: mutateCollaborators } = useProjectCollaborators(
        isOpen && !isLocalOnly && isOwner ? membership?.project.id : undefined,
    );

    // Everyone but the current owner is a candidate for the handover.
    const candidates = useMemo(
        () => members.filter((m) => m.role !== ProjectRole.OWNER && m.user.id !== user?.id),
        [members, user?.id],
    );

    // Default to the first candidate, and drop a selection that disappeared
    // (member kicked or list refreshed while the modal was open).
    useEffect(() => {
        if (candidates.length === 0) {
            setTransferTargetId("");
        } else if (!candidates.some((c) => c.user.id === transferTargetId)) {
            setTransferTargetId(candidates[0].user.id);
        }
    }, [candidates, transferTargetId]);

    if (!projectId || !isOpen) return null;

    const handleDeleteProject = async () => {
        setLoading(true);
        try {
            if (isLocalOnly) {
                const { deleteCachedProject } = await import("@src/lib/persistence/storage-provider/local-persistence");
                await deleteCachedProject(projectId);
                closeDashboard();
                goToProjects();
            } else if (membership) {
                const res = await deleteProject(membership.project.id);
                if (res.ok) {
                    // Also clean up local copy
                    const { deleteCachedProject } =
                        await import("@src/lib/persistence/storage-provider/local-persistence");
                    await deleteCachedProject(projectId);
                    closeDashboard();
                    goToProjects();
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const closeTransferDialog = () => {
        setShowTransferDialog(false);
        setTransferError(null);
    };

    const handleTransferOwnership = async () => {
        if (!membership || !transferTargetId) return;

        setTransferLoading(true);
        setTransferError(null);
        try {
            const res = await transferProjectOwnership(membership.project.id, transferTargetId);
            if (res.ok) {
                // The caller is now an editor: refresh the membership so the danger
                // zone and every role-gated control drop to the new permissions, and
                // the member list so the collaborators panel shows the new owner.
                mutateMembership();
                mutateCollaborators();
                closeTransferDialog();
            } else {
                const data = (await res.json().catch(() => null)) as ApiResponse | null;
                setTransferError(
                    res.status === 402 ? t("transferProRequired") : data?.message || t("transferFailed"),
                );
            }
        } catch {
            setTransferError(t("transferFailed"));
        } finally {
            setTransferLoading(false);
        }
    };

    return (
        <>
            <div className={styles.dangerContainer}>
                {/* Transfer Ownership - only for remote projects, and only the owner has one to give */}
                {!isLocalOnly && membership && isOwner && (
                    <div className={styles.dangerItem}>
                        <div>
                            <p className={`${form.label} ${styles.dangerLabel}`}>{t("transferOwnership")}</p>
                            <p className={styles.dangerDescription}>{t("transferDesc")}</p>
                        </div>
                        <button className={styles.dangerBtn} onClick={() => setShowTransferDialog(true)}>
                            {t("transferBtn")}
                        </button>
                    </div>
                )}

                {/* Delete Project */}
                <div className={styles.dangerItem}>
                    <div>
                        <p className={`${form.label} ${styles.dangerLabel}`}>{t("deleteProject")}</p>
                        <p className={styles.dangerDescription}>{t("deleteProjectDesc")}</p>
                    </div>
                    <button className={styles.dangerBtn} onClick={() => setShowDeleteDialog(true)}>
                        {t("deleteBtn")}
                    </button>
                </div>
            </div>

            {/* Ownership transfer dialog */}
            {showTransferDialog && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>{t("transferModalTitle")}</h2>
                        <p className={styles.modalDescription}>{t("transferModalDesc")}</p>

                        {candidates.length === 0 ? (
                            <p className={styles.modalDescription}>{t("transferNoCandidates")}</p>
                        ) : (
                            <>
                                <label htmlFor="transfer-new-owner" className={form.label}>
                                    {t("transferSelectLabel")}
                                </label>
                                <select
                                    id="transfer-new-owner"
                                    className={`${collaborators.roleSelect} ${styles.modalSelect}`}
                                    value={transferTargetId}
                                    onChange={(e) => setTransferTargetId(e.target.value)}
                                    disabled={transferLoading}
                                >
                                    {candidates.map((c) => (
                                        <option key={c.user.id} value={c.user.id}>
                                            {c.user.email}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}

                        {transferError && <p className={styles.modalError}>{transferError}</p>}

                        <div className={styles.modalActions}>
                            {candidates.length > 0 && (
                                <button
                                    className={`${modal.modalBtn} ${modal.modalBtnDanger}`}
                                    onClick={handleTransferOwnership}
                                    disabled={transferLoading || !transferTargetId}
                                >
                                    <UserRoundCog size={16} color="#ffffff" />
                                    {transferLoading ? t("transferring") : t("confirmTransferBtn")}
                                </button>
                            )}
                            <button
                                className={`${modal.modalBtn} ${modal.modalBtnCancel}`}
                                onClick={closeTransferDialog}
                                disabled={transferLoading}
                            >
                                {tCommon("cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation dialog */}
            {showDeleteDialog && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>{t("modalTitle")}</h2>
                        <p className={styles.modalDescription}>{t("modalDesc")}</p>
                        <div className={styles.modalActions}>
                            <button
                                className={`${modal.modalBtn} ${modal.modalBtnDanger}`}
                                onClick={handleDeleteProject}
                                disabled={loading}
                            >
                                <Trash2 size={16} color="#ffffff" />
                                {loading ? t("deleting") : t("confirmDeleteBtn")}
                            </button>
                            <button
                                className={`${modal.modalBtn} ${modal.modalBtnCancel}`}
                                onClick={() => setShowDeleteDialog(false)}
                                disabled={loading}
                            >
                                {tCommon("cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DangerZone;
