"use client";

import { useContext, useState, useRef } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser } from "@src/lib/utils/hooks";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./ExportProject.module.css";
import { importFilePopup } from "@src/lib/screenplay/popup";
import { UserContext } from "@src/context/UserContext";
import { getAdapterByExtension, getAdapterByFilename } from "@src/lib/adapters/registry";
import { BaseExportOptions } from "@src/lib/adapters/screenplay-adapter";
import { PDFExportOptions } from "@src/lib/adapters/pdf/pdf-adapter";

export enum ExportFormat {
    PDF = "pdf",
    FOUNTAIN = "fountain",
    FDX = "fdx",
}

const ExportProject = () => {
    const { user } = useCookieUser();
    const { project: membership, screenplay, editor } = useContext(ProjectContext);
    const userContext = useContext(UserContext);

    const [format, setFormat] = useState<ExportFormat>(ExportFormat.PDF);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [isExporting, setExporting] = useState(false);

    // Reference for the hidden file input
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!membership || !user) return null;

    // --- Import Logic ---
    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const adapter = getAdapterByFilename(file.name);
        if (!adapter) {
            console.error("Unsupported file type");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target?.result as string;
            if (!content || !editor) return;

            const confirmImport = () => {
                adapter.import(content, editor);
                editor.commands.focus(); // Required to trigger pagination recompute
            };

            importFilePopup(userContext, confirmImport);
        };

        reader.readAsText(file);

        // Reset input so the same file can be selected again if needed
        event.target.value = "";
    };

    const handleExport = async () => {
        setExporting(true);
        let baseOptions: BaseExportOptions = {
            title: membership.project.title,
            author: user.id || "Unknown",
            includeNotes,
        };

        const adapter = getAdapterByExtension(format);
        if (!adapter) {
            console.error("Unsupported file type");
            return;
        }

        if (format === ExportFormat.PDF) {
            const pdfOptions: PDFExportOptions = {
                ...baseOptions,
                format: "A4",
                watermark: includeWatermark,
            };
            await adapter.export(screenplay, pdfOptions);
        } else {
            await adapter.export(screenplay, baseOptions);
        }

        setExporting(false);
    };

    return (
        <div className={sharedStyles.settingsForm}>
            {/* --- Import Section --- */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Import</label>

                {/* Hidden Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    accept=".fountain,.txt,.fdx"
                    style={{ display: "none" }}
                />

                {/* Styled Clickable Div */}
                <div className={styles.optionCard} onClick={() => fileInputRef.current?.click()}>
                    {/* SVG Icon matching the visual weight of the checkboxes in other options */}
                    <div className={styles.checkbox} style={{ border: "none", background: "transparent" }}>
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    </div>

                    <div className={styles.optionInfo}>
                        <span className={styles.optionTitle}>Select File</span>
                        <span className={styles.optionDesc}>Upload .fountain, .fdx or .txt</span>
                    </div>
                </div>

                <p className={sharedStyles.helpText}>Warning: This will replace your current screenplay.</p>
            </div>

            {/* --- Export Format Selection --- */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Export</label>
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

            {/* --- Export Options --- */}
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
