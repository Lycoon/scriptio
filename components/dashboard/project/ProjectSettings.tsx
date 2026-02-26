"use client";

import { cropImageBase64 } from "@src/lib/utils/misc";
import { useTranslations } from "next-intl";
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
    const t = useTranslations("projectSettings");
    const { membership, mutate } = useProjectMembership();
    const { setProjectTitle: setContextTitle } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();
    const {
        title: localTitle,
        description: localDescription,
        author: localAuthor,
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
    const projectAuthor = membership?.project.author || localAuthor;

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
        const newAuthor = target.author.value;

        if (isLocalOnly) {
            // Save to local SQLite
            try {
                const { updateLocalProject } = await import("@src/lib/persistence/local-projects");
                await updateLocalProject(projectId, { title: newTitle, description: newDescription, author: newAuthor });
            } catch (error) {
                console.error("[ProjectSettings] Failed to save local project:", error);
            }
        } else if (membership) {
            // Save to remote API
            const body: any = {
                title: newTitle,
                description: newDescription,
                author: newAuthor,
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
                <label className={form.label}>{t("titleLabel")}</label>
                <input
                    name="title"
                    type="text"
                    defaultValue={projectTitle}
                    onChange={() => setDirty(true)}
                    className={styles.input}
                    placeholder={t("titlePlaceholder")}
                />
            </div>

            {/* Author */}
            <div className={styles.formGroup}>
                <label className={form.label}>{t("authorLabel")}</label>
                <input
                    name="author"
                    type="text"
                    defaultValue={projectAuthor ?? ""}
                    onChange={() => setDirty(true)}
                    className={styles.input}
                    placeholder={t("authorPlaceholder")}
                />
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
                <label className={form.label}>{t("descriptionLabel")}</label>
                <textarea
                    name="description"
                    defaultValue={projectDescription ?? ""}
                    onChange={() => setDirty(true)}
                    className={styles.textarea}
                    placeholder={t("descriptionPlaceholder")}
                />
            </div>

            {/* Poster - only show for remote projects */}
            {!isLocalOnly && (
                <div className={styles.formGroup}>
                    <label className={form.label}>{t("posterLabel")}</label>
                    <div className={styles.posterUploadArea}>
                        <div className={styles.posterPreview}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" />
                            ) : (
                                <div className={styles.posterPlaceholder}>{t("noPoster")}</div>
                            )}
                        </div>
                        <div className={styles.uploadControls}>
                            <p className={styles.helpText}>{t("posterHelp")}</p>
                            <UploadButton setSelectedFile={setSelectedFile} selectedFile={selectedFile} />
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.formActions}>
                <button type="submit" className={`${styles.formBtn}`} disabled={loading || !isDirty}>
                    {t("saveChanges")}
                </button>
                <button type="button" className={dangerStyles.arrowBtn} onClick={onDangerToggle} title={t("dangerZoneTitle")}>
                    <ArrowRight size={16} />
                </button>
            </div>
        </form>
    );
};

export default ProjectSettings;
