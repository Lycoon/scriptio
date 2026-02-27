"use client";

import { useContext, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { isTauri } from "@tauri-apps/api/core";
import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser, useLocalProjectInfo, useProjectIdFromUrl } from "@src/lib/utils/hooks";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./ExportProject.module.css";
import optionCard from "./OptionCard.module.css";
import { importFilePopup } from "@src/lib/screenplay/popup";
import { UserContext } from "@src/context/UserContext";
import { getAdapterByExtension, getAdapterByFilename } from "@src/lib/adapters/registry";
import { BaseExportOptions } from "@src/lib/adapters/screenplay-adapter";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";
import { PDFExportOptions } from "@src/lib/adapters/pdf/pdf-adapter";
import { ScriptioExportOptions } from "@src/lib/adapters/scriptio/scriptio-adapter";

export enum ExportFormat {
    PDF = "pdf",
    FOUNTAIN = "fountain",
    FDX = "fdx",
    SCRIPTIO = "scriptio",
}

const ExportProject = () => {
    const t = useTranslations("export");
    const { user } = useCookieUser();
    const {
        project: membership,
        repository,
        editor,
        titlePageEditor,
        pageFormat,
        displaySceneNumbers,
        sceneHeadingBold,
        sceneHeadingDoubleSpace,
        sceneNumberOnRight,
        contdLabel,
        moreLabel,
    } = useContext(ProjectContext);
    const ydoc = repository?.getState();
    const userContext = useContext(UserContext);

    // For local projects on desktop without auth
    const projectId = useProjectIdFromUrl();
    const { title: localTitle, author: localAuthor } = useLocalProjectInfo(projectId);

    const [format, setFormat] = useState<ExportFormat>(ExportFormat.PDF);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [enablePassword, setEnablePassword] = useState<boolean>(false);
    const [password, setPassword] = useState<string>("");
    const [readableExport, setReadableExport] = useState<boolean>(false);
    const [isExporting, setExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    // Reference for the hidden file input
    const fileInputRef = useRef<HTMLInputElement>(null);

    // On desktop, allow export without user/membership (local projects)
    const isDesktop = isTauri();
    if (!isDesktop && (!membership || !user)) return null;

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
            const content = e.target?.result as ArrayBuffer;
            if (!content || !editor) return;

            const confirmImport = () => {
                adapter.import(content, editor);
                editor.commands.focus(); // Required to trigger pagination recompute
            };

            importFilePopup(userContext, confirmImport);
        };

        reader.readAsArrayBuffer(file);
        event.target.value = ""; // Reset input so the same file can be selected again if needed
    };

    const handleExport = async () => {
        setExporting(true);

        // Use membership title if available, otherwise use local title
        const projectTitle = membership?.project.title || localTitle;
        const authorEmail = user?.email || "Unknown";
        const projectAuthor = membership?.project.author || localAuthor || undefined;

        let baseOptions: BaseExportOptions = {
            title: projectTitle,
            author: authorEmail,
            projectAuthor,
            includeNotes,
            onProgress: (p) => { console.log("progress: ", p);setProgress(p) },
        };

        const adapter = getAdapterByExtension(format);
        if (!adapter) {
            console.error("Unsupported file type");
            return;
        }

        if (!ydoc) {
            console.error("No project state loaded");
            return;
        }

        if (format === ExportFormat.PDF) {
            const pdfOptions: PDFExportOptions = {
                ...baseOptions,
                format: pageFormat === "A4" ? "A4" : "LETTER",
                watermark: includeWatermark,
                password: enablePassword && password ? password : undefined,
                displaySceneNumbers,
                sceneHeadingBold,
                sceneHeadingDoubleSpace,
                sceneNumberOnRight,
                contdLabel,
                moreLabel,
                editorElement: editor?.view?.dom,
                titlePageElement: titlePageEditor?.view?.dom,
            };
            await adapter.export(ydoc, pdfOptions as any);
        } else if (format === ExportFormat.SCRIPTIO) {
            const scriptioOptions: ScriptioExportOptions = {
                ...baseOptions,
                readable: readableExport,
            };
            await adapter.export(ydoc, scriptioOptions as any);
        } else {
            await adapter.export(ydoc, baseOptions);
        }

        setExporting(false);
        setProgress(0);
    };

    const formatOptions: DropdownOption[] = [
        { value: ExportFormat.PDF, label: t("formatOptions.pdf") },
        { value: ExportFormat.FOUNTAIN, label: t("formatOptions.fountain") },
        { value: ExportFormat.FDX, label: t("formatOptions.fdx") },
        { value: ExportFormat.SCRIPTIO, label: t("formatOptions.scriptio") },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            {/* --- Import Section --- */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("importLabel")}</label>

                {/* Hidden Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    accept=".fountain,.txt,.fdx,.scriptio"
                    style={{ display: "none" }}
                />

                {/* Styled Clickable Div */}
                <div className={optionCard.optionCard} onClick={() => fileInputRef.current?.click()}>
                    {/* SVG Icon matching the visual weight of the checkboxes in other options */}
                    <div className={optionCard.checkbox} style={{ border: "none", background: "transparent" }}>
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

                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("selectFile")}</span>
                        <span className={optionCard.optionDesc}>{t("selectFileDesc")}</span>
                    </div>
                </div>
            </div>

            {/* --- Export Format Selection --- */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("exportLabel")}</label>
                <Dropdown
                    value={format}
                    onChange={(value) => setFormat(value as ExportFormat)}
                    options={formatOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
                <p className={sharedStyles.helpText}>
                    {format === ExportFormat.PDF && t("formatHelp.pdf")}
                    {format === ExportFormat.FOUNTAIN && t("formatHelp.fountain")}
                    {format === ExportFormat.FDX && t("formatHelp.fdx")}
                    {format === ExportFormat.SCRIPTIO && t("formatHelp.scriptio")}
                </p>
            </div>

            {/* --- Export Options --- */}
            <div className={styles.options}>
                {/* Notes Toggle */}
                <div
                    className={`${optionCard.optionCard} ${includeNotes ? optionCard.active : ""}`}
                    onClick={() => setIncludeNotes(!includeNotes)}
                >
                    <div className={optionCard.checkbox}>
                        {includeNotes && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("includeNotes")}</span>
                        <span className={optionCard.optionDesc}>{t("includeNotesDesc")}</span>
                    </div>
                </div>

                {/* Readable JSON Toggle (Scriptio Only) */}
                {format === ExportFormat.SCRIPTIO && (
                    <div
                        className={`${optionCard.optionCard} ${readableExport ? optionCard.active : ""}`}
                        onClick={() => setReadableExport(!readableExport)}
                    >
                        <div className={optionCard.checkbox}>
                            {readableExport && <div className={optionCard.checkInner} />}
                        </div>
                        <div className={optionCard.optionInfo}>
                            <span className={optionCard.optionTitle}>{t("readable")}</span>
                            <span className={optionCard.optionDesc}>{t("readableDesc")}</span>
                        </div>
                    </div>
                )}

                {/* Watermark Toggle (PDF Only) */}
                {format === ExportFormat.PDF && (
                    <div
                        className={`${optionCard.optionCard} ${includeWatermark ? optionCard.active : ""}`}
                        onClick={() => setIncludeWatermark(!includeWatermark)}
                    >
                        <div className={optionCard.checkbox}>
                            {includeWatermark && <div className={optionCard.checkInner} />}
                        </div>
                        <div className={optionCard.optionInfo}>
                            <span className={optionCard.optionTitle}>{t("watermark")}</span>
                            <span className={optionCard.optionDesc}>{t("watermarkDesc")}</span>
                        </div>
                    </div>
                )}

                {/* Password Protection Toggle (PDF Only) */}
                {format === ExportFormat.PDF && (
                    <div
                        className={`${optionCard.optionCard} ${optionCard.optionCardExpandable} ${
                            enablePassword ? optionCard.active : ""
                        }`}
                        onClick={() => setEnablePassword(!enablePassword)}
                    >
                        <div className={optionCard.optionRow}>
                            <div className={optionCard.checkbox}>
                                {enablePassword && <div className={optionCard.checkInner} />}
                            </div>
                            <div className={optionCard.optionInfo}>
                                <span className={optionCard.optionTitle}>{t("passwordProtection")}</span>
                                <span className={optionCard.optionDesc}>{t("passwordProtectionDesc")}</span>
                            </div>
                        </div>
                        {enablePassword && (
                            <input
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t("passwordPlaceholder")}
                                className={`${sharedStyles.input} ${styles.passwordInput}`}
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>
                )}
            </div>

            <div className={sharedStyles.formActions}>
                <button onClick={handleExport} disabled={isExporting} className={`${sharedStyles.formBtn}`}>
                    {isExporting
                        ? (progress > 0 ? t("exportingProgress", { progress: Math.round(progress) }) : t("exporting"))
                        : t("exportBtn")}
                </button>
            </div>
        </div>
    );
};

export default ExportProject;
