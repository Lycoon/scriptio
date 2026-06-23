"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";

import type { ProjectMigrationOutcome } from "@src/lib/project/migrations/project-migration-runner";

import styles from "./ProjectMigrationErrorDialog.module.css";

interface Props {
    outcome: Extract<
        ProjectMigrationOutcome,
        { kind: "future-version" | "failed" | "stale-client" }
    >;
}

const ProjectMigrationErrorDialog = ({ outcome }: Props) => {
    const router = useRouter();
    const params = useSearchParams();
    const projectId = params.get("projectId");
    const [busy, setBusy] = useState(false);

    const goBack = useCallback(() => {
        router.replace("/projects");
    }, [router]);

    const handleRestore = useCallback(async () => {
        if (!projectId) return;
        setBusy(true);
        try {
            const { restoreProjectFromBackup } = await import(
                "@src/lib/project/migrations/project-migration-runner"
            );
            const ok = await restoreProjectFromBackup(projectId);
            if (ok) {
                window.location.reload();
                return;
            }
            console.error("[ProjectMigrationErrorDialog] No backup available to restore");
        } catch (e) {
            console.error("[ProjectMigrationErrorDialog] Restore failed:", e);
        }
        setBusy(false);
    }, [projectId]);

    if (outcome.kind === "future-version") {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <h2 className={styles.title}>Project from a newer version</h2>
                    <p className={styles.description}>
                        This project was created or last edited in a newer version of Scriptio. Update the
                        app to open it safely.
                    </p>
                    <p className={styles.versionDetails}>
                        Project version: {outcome.storedVersion} — App expects: {outcome.expected}
                    </p>
                    <div className={styles.actions}>
                        <button className={`${styles.btn} ${styles.secondaryBtn}`} onClick={goBack}>
                            <ArrowLeft size={16} />
                            Back to projects
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (outcome.kind === "stale-client") {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <h2 className={styles.title}>Update Scriptio to open this project</h2>
                    <p className={styles.description}>
                        The cloud copy of this project is at a newer schema version than your app
                        knows. Reload to fetch the latest version, or update the desktop app.
                    </p>
                    <div className={styles.actions}>
                        <button
                            className={`${styles.btn} ${styles.primaryBtn}`}
                            onClick={() => window.location.reload()}
                        >
                            <RefreshCw size={16} />
                            Reload
                        </button>
                        <button className={`${styles.btn} ${styles.secondaryBtn}`} onClick={goBack}>
                            <ArrowLeft size={16} />
                            Back to projects
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <h2 className={styles.title}>Could not upgrade this project</h2>
                <p className={styles.description}>
                    Scriptio tried to upgrade this project to the latest version but a step failed. Your
                    original data is safe — restore from the pre-upgrade backup, or open another project.
                </p>
                <p className={styles.versionDetails}>
                    Failed at version {outcome.failedAt}: {outcome.error.message}
                </p>
                <div className={styles.actions}>
                    <button
                        className={`${styles.btn} ${styles.primaryBtn}`}
                        onClick={handleRestore}
                        disabled={busy}
                    >
                        <RotateCcw size={16} />
                        Restore from backup
                    </button>
                    <button
                        className={`${styles.btn} ${styles.secondaryBtn}`}
                        onClick={goBack}
                        disabled={busy}
                    >
                        <ArrowLeft size={16} />
                        Back to projects
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectMigrationErrorDialog;
