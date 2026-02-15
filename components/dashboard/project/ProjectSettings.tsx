"use client";

import { cropImageBase64 } from "@src/lib/utils/misc";
import { editProject } from "@src/lib/utils/requests";
import { useContext, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useProjectMembership, useLocalProjectInfo, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import UploadButton from "@components/projects/UploadButton";
import DangerZone from "./DangerZone";
import { ArrowRight } from "lucide-react";
import form from "./../../utils/Form.module.css";
import styles from "./ProjectSettings.module.css";
import dangerStyles from "./DangerZone.module.css";

const ProjectSettings = ({ dangerOpen, onDangerToggle }: { dangerOpen: boolean; onDangerToggle: () => void }) => {
    const { membership, mutate } = useProjectMembership();
    const { setProjectTitle: setContextTitle } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();
    const {
        title: localTitle,
        description: localDescription,
        isLoading: localLoading,
    } = useLocalProjectInfo(projectId);

    const [isDirty, setDirty] = useState<boolean>(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(membership?.project.poster || null);
    const [loading, setLoading] = useState(false);

    // Determine if this is a local-only project (desktop without membership)
    const isDesktop = isTauri();
    const isLocalOnly = isDesktop && !membership;

    // Get project data from membership or local info
    const projectTitle = membership?.project.title || localTitle;
    const projectDescription = membership?.project.description || localDescription;

    useEffect(() => {
        if (!selectedFile) return;
        const objectUrl = URL.createObjectURL(selectedFile);
        setDirty(true);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!projectId) return;
        setLoading(true);
        setDirty(false);

        const target = e.target as any;
        const newTitle = target.title.value;
        const newDescription = target.description.value;

        if (isLocalOnly) {
            // Save to local SQLite
            try {
                const { updateLocalProject } = await import("@src/lib/persistence/local-projects");
                await updateLocalProject(projectId, { title: newTitle, description: newDescription });
            } catch (error) {
                console.error("[ProjectSettings] Failed to save local project:", error);
            }
        } else if (membership) {
            // Save to remote API
            const body: any = {
                title: newTitle,
                description: newDescription,
            };

            if (selectedFile) {
                body.poster = await cropImageBase64(selectedFile, 600, 900);
            }

            await editProject(membership.project.id, body);
        }

        // Sync title to Yjs metadata (updates title page editor)
        setContextTitle(newTitle);
        // Revalidate SWR so navbar and browser tab update via updateProject()
        mutate();

        setLoading(false);
    };

    // On web, require membership. On desktop, allow local projects.
    if (!isDesktop && !membership) return null;
    // Wait for local project info to load before rendering the form
    if (isLocalOnly && localLoading) return null;

    if (dangerOpen) {
        return <DangerZone projectId={projectId} isLocalOnly={isLocalOnly} isOpen={true} />;
    }

    return (
        <form key={projectTitle} onSubmit={handleSave} className={styles.settingsForm}>
            {/* Title */}
            <div className={styles.formGroup}>
                <label className={form.label}>Title</label>
                <input
                    name="title"
                    type="text"
                    defaultValue={projectTitle}
                    onChange={() => setDirty(true)}
                    className={styles.input}
                    placeholder="Enter project name..."
                />
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
                <label className={form.label}>Description</label>
                <textarea
                    name="description"
                    defaultValue={projectDescription ?? ""}
                    onChange={() => setDirty(true)}
                    className={styles.textarea}
                    placeholder="What is this screenplay about?"
                />
            </div>

            {/* Poster - only show for remote projects */}
            {!isLocalOnly && (
                <div className={styles.formGroup}>
                    <label className={form.label}>Poster</label>
                    <div className={styles.posterUploadArea}>
                        <div className={styles.posterPreview}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" />
                            ) : (
                                <div className={styles.posterPlaceholder}>No Poster</div>
                            )}
                        </div>
                        <div className={styles.uploadControls}>
                            <p className={styles.helpText}>
                                Recommended: 600x900 pixels (2:3 ratio). <br />
                                Supports PNG, JPG.
                            </p>
                            <UploadButton setSelectedFile={setSelectedFile} selectedFile={selectedFile} />
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.formActions}>
                <button type="submit" className={`${styles.formBtn}`} disabled={loading || !isDirty}>
                    Save changes
                </button>
                <button type="button" className={dangerStyles.arrowBtn} onClick={onDangerToggle} title="Danger zone">
                    <ArrowRight size={16} />
                </button>
            </div>
        </form>
    );
};

export default ProjectSettings;
