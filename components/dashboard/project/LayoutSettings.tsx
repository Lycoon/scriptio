"use client";

import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { PageFormat } from "@src/lib/utils/enums";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";

const LayoutSettings = () => {
    const { pageFormat, setPageFormat } = useContext(ProjectContext);

    const handleFormatChange = (newFormat: PageFormat) => {
        setPageFormat(newFormat);
    };

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Page Format</label>
                <select
                    value={pageFormat}
                    onChange={(e) => handleFormatChange(e.target.value as PageFormat)}
                    className={`${sharedStyles.input} ${styles.input}`}
                >
                    <option value="Letter">US Letter (8.5" x 11")</option>
                    <option value="A4">A4 (210mm x 297mm)</option>
                </select>
                <p className={sharedStyles.helpText}>
                    {pageFormat === "Letter" &&
                        "Standard format used in the United States. Industry standard for Hollywood screenplays."}
                    {pageFormat === "A4" && "International standard format. Common in Europe and most other countries."}
                </p>
            </div>
        </div>
    );
};

export default LayoutSettings;
