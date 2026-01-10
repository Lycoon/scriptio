"use client";

import { useContext, useState } from "react";
import FileSaver from "file-saver";
import { ProjectContext } from "@src/context/ProjectContext";
import { convertToFountain } from "@src/lib/converters/export/fountain";
import { convertToFDX } from "@src/lib/converters/export/fdx";
import { exportToPDF } from "@src/lib/converters/export/pdf";
import { useCookieUser } from "@src/lib/utils/hooks";

// Reusing form styles for consistency
import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./ExportProject.module.css";

export enum ExportFormat {
    PDF = "pdf",
    FOUNTAIN = "fountain",
    FDX = "fdx",
}

const ExportProject = () => {
    const { user } = useCookieUser();
    const { project: membership, screenplay } = useContext(ProjectContext);

    const [format, setFormat] = useState<ExportFormat>(ExportFormat.PDF);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [isExporting, setExporting] = useState(false);

    if (!membership || !user) return null;

    const handleExport = async () => {
        setExporting(true);
        const exportData = {
            title: membership.project.title,
            author: user.id || "Unknown",
            notes: includeNotes,
            watermark: includeWatermark,
        };

        try {
            if (format === ExportFormat.PDF) {
                // PDF Export Logic
                const pdf = await exportToPDF(screenplay, exportData);
                pdf.getBlob((blob: Blob) => {
                    FileSaver.saveAs(blob, `${exportData.title}.pdf`);
                });
            } else if (format === ExportFormat.FOUNTAIN) {
                // Fountain Export Logic
                const content = convertToFountain(screenplay, exportData);
                const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                FileSaver.saveAs(blob, `${exportData.title}.fountain`);
            } else if (format === ExportFormat.FDX) {
                // FDX Export Logic
                const content = convertToFDX(screenplay, exportData);
                const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                FileSaver.saveAs(blob, `${exportData.title}.fdx`);
            }
        } catch (error) {
            console.error("Export failed", error);
            // Handle error toast here
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className={sharedStyles.settingsForm}>
            {/* Format Selection */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>File Format</label>
                <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ExportFormat)}
                    className={`${sharedStyles.input} ${styles.input}`}
                >
                    <option value={ExportFormat.PDF}>PDF Document (.pdf)</option>
                    <option value={ExportFormat.FOUNTAIN}>Fountain (.fountain)</option>
                    <option value={ExportFormat.FDX}>Final Draft (.fdx)</option>
                </select>
                <p className={sharedStyles.helpText}>
                    {format === ExportFormat.PDF && "Standard industry format. Best for sharing and printing."}
                    {format === ExportFormat.FOUNTAIN &&
                        "Plain text format based on markdown, great for compatibility."}
                    {format === ExportFormat.FDX && "Compatible with Final Draft industry software."}
                </p>
            </div>

            {/* Export Options */}
            <div className={styles.options}>
                {/* Notes Toggle */}
                <div
                    className={`${styles.optionCard} ${includeNotes ? styles.active : ""}`}
                    onClick={() => setIncludeNotes(!includeNotes)}
                >
                    <div className={styles.checkbox}>{includeNotes && <div className={styles.checkInner} />}</div>
                    <div className={styles.optionInfo}>
                        <span className={styles.optionTitle}>Include Notes</span>
                        <span className={styles.optionDesc}>Export inline notes.</span>
                    </div>
                </div>

                {/* Watermark Toggle (PDF Only) */}
                {format === ExportFormat.PDF && (
                    <div
                        className={`${styles.optionCard} ${includeWatermark ? styles.active : ""}`}
                        onClick={() => setIncludeWatermark(!includeWatermark)}
                    >
                        <div className={styles.checkbox}>
                            {includeWatermark && <div className={styles.checkInner} />}
                        </div>
                        <div className={styles.optionInfo}>
                            <span className={styles.optionTitle}>Watermark</span>
                            <span className={styles.optionDesc}>Overlay the author's name on pages.</span>
                        </div>
                    </div>
                )}
            </div>

            <div className={sharedStyles.formActions}>
                <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className={`${sharedStyles.formBtn} ${sharedStyles.success}`}
                >
                    {isExporting ? "Exporting..." : "Download"}
                </button>
            </div>
        </div>
    );
};

export default ExportProject;
