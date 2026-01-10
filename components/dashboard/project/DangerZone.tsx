"use client";

import { deleteProject } from "@src/lib/utils/requests";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { redirectHome } from "@src/lib/utils/redirects";
import { useContext } from "react";
import { DashboardContext } from "@src/context/DashboardContext";

import styles from "./DangerZone.module.css";
import form from "../../utils/Form.module.css";

const DangerZone = () => {
    const { membership } = useProjectMembership();
    const { closeDashboard } = useContext(DashboardContext);

    if (!membership) return null;

    const handleDeleteProject = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this project? This action is permanent and cannot be undone."
        );
        if (confirmed) {
            const res = await deleteProject(membership.project.id);
            if (res.ok) {
                closeDashboard();
                redirectHome();
            }
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
        <div className={styles.dangerZone}>
            <h4 className={styles.dangerTitle}>Danger Zone</h4>
            <div className={styles.dangerContainer}>
                {/* Transfer Ownership */}
                <div className={styles.dangerItem}>
                    <div className={styles.dangerText}>
                        <p className={form.label}>Transfer ownership</p>
                        <p className={styles.dangerDescription}>
                            Transfer your owner role to another user. You will be given editor role.
                        </p>
                    </div>
                    <button className={styles.dangerBtn} onClick={handleTransferOwnership}>
                        Transfer
                    </button>
                </div>

                {/* Delete Project */}
                <div className={styles.dangerItem}>
                    <div className={styles.dangerText}>
                        <p className={form.label}>Delete project</p>
                        <p className={styles.dangerDescription}>
                            Once you delete a project, there is no going back. Please be certain.
                        </p>
                    </div>
                    <button className={styles.dangerBtn} onClick={handleDeleteProject}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DangerZone;
