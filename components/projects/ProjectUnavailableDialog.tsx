"use client";

import { useCallback, useContext, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import {
    discardCloudProjectData,
    getCachedProject,
    migrateToCachedProject,
} from "@src/lib/persistence/storage-provider/local-persistence";

import styles from "./ProjectUnavailableDialog.module.css";

const ProjectUnavailableDialog = () => {
    const router = useRouter();
    const params = useSearchParams();
    const projectId = params.get("projectId");
    const { project, repository } = useContext(ProjectContext);

    const [loading, setLoading] = useState(false);

    const handleKeep = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const cached = await getCachedProject(projectId);
            const title = cached?.title || project?.project?.title || repository?.getTitle() || "Untitled Project";
            const newProject = await migrateToCachedProject(projectId, title, cached?.description ?? undefined);
            router.replace(`/projects?projectId=${newProject.id}`);
        } catch (e) {
            console.error("[ProjectUnavailableDialog] Migration failed:", e);
            setLoading(false);
        }
    }, [projectId, repository, router, project]);

    const handleDiscard = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            await discardCloudProjectData(projectId);
            router.replace("/projects");
        } catch (e) {
            console.error("[ProjectUnavailableDialog] Discard failed:", e);
            setLoading(false);
        }
    }, [projectId, router]);

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <h2 className={styles.title}>Project unavailable</h2>
                <p className={styles.description}>
                    This cloud project has been deleted or you no longer have access. You can keep a local copy of the
                    content you have, or discard it.
                </p>
                <div className={styles.actions}>
                    <button className={`${styles.btn} ${styles.keepBtn}`} onClick={handleKeep} disabled={loading}>
                        <Save size={16} />
                        Keep as local project
                    </button>
                    <button className={`${styles.btn} ${styles.discardBtn}`} onClick={handleDiscard} disabled={loading}>
                        <Trash2 size={16} />
                        Discard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectUnavailableDialog;
