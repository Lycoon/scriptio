import { cropImageBase64 } from "@src/lib/utils/misc";
import { editProject } from "@src/lib/utils/requests";
import { useEffect, useState } from "react";
import { useProjectMembership } from "@src/lib/utils/hooks";
import UploadButton from "@components/projects/UploadButton";
import DangerZone from "./DangerZone";

import form from "./../../utils/Form.module.css";
import styles from "./ProjectSettings.module.css";

const ProjectSettings = () => {
    const { membership } = useProjectMembership();
    const [isDirty, setDirty] = useState<boolean>(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(membership?.project.poster || null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedFile) return;
        const objectUrl = URL.createObjectURL(selectedFile);
        setDirty(true);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!membership) return;
        setLoading(true);
        setDirty(false);

        const target = e.target as any;
        const body: any = {
            title: target.title.value,
            description: target.description.value,
        };

        if (selectedFile) {
            body.poster = await cropImageBase64(selectedFile, 600, 900);
        }

        const res = await editProject(membership.project.id, body);
        if (res.ok) {
        }
        setLoading(false);
    };

    if (!membership) return null;

    return (
        <form onSubmit={handleSave} className={styles.settingsForm}>
            {/* Title */}
            <div className={styles.formGroup}>
                <label className={form.label}>Title</label>
                <input
                    name="title"
                    type="text"
                    defaultValue={membership.project.title}
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
                    defaultValue={membership.project.description ?? ""}
                    onChange={() => setDirty(true)}
                    className={styles.textarea}
                    placeholder="What is this screenplay about?"
                />
            </div>

            {/* Poster */}
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

            <div className={styles.formActions}>
                <button type="submit" className={styles.saveBtn} disabled={loading || !isDirty}>
                    Save changes
                </button>
            </div>
            <DangerZone />
        </form>
    );
};

export default ProjectSettings;
