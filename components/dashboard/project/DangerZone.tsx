"use client";

import { deleteProject } from "@src/lib/utils/requests";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { redirectHome } from "@src/lib/utils/redirects";
import { useContext, useState } from "react";
import { DashboardContext } from "@src/context/DashboardContext";
import { Trash2 } from "lucide-react";

import styles from "./DangerZone.module.css";
import form from "../../utils/Form.module.css";

interface DangerZoneProps {
    projectId: string | null;
    isLocalOnly: boolean;
    isOpen: boolean;
}

const DangerZone = ({ projectId, isLocalOnly, isOpen }: DangerZoneProps) => {
    const { membership } = useProjectMembership();
    const { closeDashboard } = useContext(DashboardContext);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!projectId || !isOpen) return null;

    const handleDeleteProject = async () => {
        setLoading(true);
        try {
            if (isLocalOnly) {
                const { deleteLocalProject } = await import("@src/lib/persistence/local-projects");
                await deleteLocalProject(projectId);
                closeDashboard();
                redirectHome();
            } else if (membership) {
                const res = await deleteProject(membership.project.id);
                if (res.ok) {
                    closeDashboard();
                    redirectHome();
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTransferOwnership = () => {
        const newOwner = window.prompt("Enter the email of the new owner:");
        if (newOwner) {
            console.log(`Transferring ownership to: ${newOwner}`);
            // Add your transfer logic here
        }
    };

    return (
        <>
            <div className={styles.dangerContainer}>
                {/* Transfer Ownership - only for remote projects */}
                {!isLocalOnly && membership && (
                    <div className={styles.dangerItem}>
                        <div>
                            <p className={`${form.label} ${styles.dangerLabel}`}>Transfer ownership</p>
                            <p className={styles.dangerDescription}>
                                Transfer your owner role to another user. You will be given editor role.
                            </p>
                        </div>
                        <button className={styles.dangerBtn} onClick={handleTransferOwnership}>
                            Transfer
                        </button>
                    </div>
                )}

                {/* Delete Project */}
                <div className={styles.dangerItem}>
                    <div>
                        <p className={`${form.label} ${styles.dangerLabel}`}>Delete project</p>
                        <p className={styles.dangerDescription}>
                            Once you delete a project, there is no going back. Please be certain.
                        </p>
                    </div>
                    <button className={styles.dangerBtn} onClick={() => setShowDeleteDialog(true)}>
                        Delete
                    </button>
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {showDeleteDialog && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <h2 className={styles.modalTitle}>Delete project</h2>
                        <p className={styles.modalDescription}>
                            This action is permanent and cannot be undone. All data associated with this project will be
                            lost.
                        </p>
                        <div className={styles.modalActions}>
                            <button
                                className={`${styles.modalBtn} ${styles.modalBtnDanger}`}
                                onClick={handleDeleteProject}
                                disabled={loading}
                            >
                                <Trash2 size={16} color="#ffffff" />
                                {loading ? "Deleting..." : "Delete project"}
                            </button>
                            <button
                                className={`${styles.modalBtn} ${styles.modalBtnCancel}`}
                                onClick={() => setShowDeleteDialog(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DangerZone;
