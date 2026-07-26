"use client";

import { useContext, useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { REVISION_COLORS } from "@src/lib/screenplay/revisions";
import { useCookieUser, useCachedProjectInfo, useProjectIdFromUrl, useProjectMembership } from "@src/lib/utils/hooks";

import sharedStyles from "./ProjectSettings.module.css";
import styles from "./ExportProject.module.css";
import optionCard from "./OptionCard.module.css";
import { importFilePopup } from "@src/lib/screenplay/popup";
import { UserContext } from "@src/context/UserContext";
import { getExportAdapter, getSupportedImportExtensions } from "@src/lib/adapters/registry";
import { ExportFormat } from "@src/lib/utils/enums";
import { BaseExportOptions } from "@src/lib/adapters/screenplay-adapter";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";
import { PDFExportOptions, RevisionExportMode } from "@src/lib/adapters/pdf/pdf-adapter";
import { ScriptioExportOptions } from "@src/lib/adapters/scriptio/scriptio-adapter";
import { TextExportOptions } from "@src/lib/adapters/text/text-adapter";
import { importFileIntoProject } from "@src/lib/import/import-project";

/** Which pages the user wants to export — a mutually exclusive choice. */
type PageMode = "all" | "ranges" | "revisions";

/**
 * Parse a page-range string like "3-14,25-30" (or single pages "7") into a list
 * of inclusive [start, end] pairs. Whitespace is tolerated and reversed pairs
 * are normalised; malformed segments are ignored so partial typing never throws.
 */
const parsePageRanges = (input: string): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    for (const part of input.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const span = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
        if (span) {
            let a = parseInt(span[1], 10);
            let b = parseInt(span[2], 10);
            if (a > b) [a, b] = [b, a];
            ranges.push([a, b]);
        } else if (/^\d+$/.test(trimmed)) {
            const n = parseInt(trimmed, 10);
            ranges.push([n, n]);
        }
    }
    return ranges;
};

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
                sceneHeadingSpacing,
        sceneNumberOnRight,
        contdLabel,
        moreLabel,
    } = useContext(ProjectContext);
    const ydoc = repository?.getState();
    const userContext = useContext(UserContext);

    const projectId = useProjectIdFromUrl();
    const { title: localTitle, author: localAuthor } = useCachedProjectInfo(projectId);
    const { isLocalOnly } = useProjectMembership();

    const [format, setFormat] = useState<ExportFormat>(ExportFormat.PDF);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [watermarkText, setWatermarkText] = useState<string>(
        membership?.project.author || localAuthor || ""
    );
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [includeTitlePage, setIncludeTitlePage] = useState<boolean>(true);
    // How production revisions are rendered into the PDF (asterisks + tinting).
    const [revisionExport, setRevisionExport] = useState<RevisionExportMode>("colored");
    // What to export — a mutually exclusive choice (radio).
    const [pageMode, setPageMode] = useState<PageMode>("all");
    const [pageRangesText, setPageRangesText] = useState<string>("");
    const [selectedRevisions, setSelectedRevisions] = useState<number[]>([]);
    const [enablePassword, setEnablePassword] = useState<boolean>(false);
    const [password, setPassword] = useState<string>("");
    const [readableExport, setReadableExport] = useState<boolean>(false);
    const [isExporting, setExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    // Reference for the hidden file input
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Revisions actually present in the screenplay (PDF only) — read straight
    // from the live editor DOM the revisions extension renders. Drives the
    // "Revisions" pages filter dropdown; empty when nothing has been stamped.
    const availableRevisions = useMemo<number[]>(() => {
        if (format !== ExportFormat.PDF) return [];
        const dom = editor?.view?.dom as HTMLElement | undefined;
        if (!dom) return [];
        const set = new Set<number>();
        const add = (raw: string | null) => {
            const v = parseInt(raw || "", 10);
            if (v >= 1 && v < REVISION_COLORS.length) set.add(v);
        };
        dom.querySelectorAll("[data-revision]").forEach((el) => add(el.getAttribute("data-revision")));
        dom.querySelectorAll("[data-revision-line]").forEach((el) => add(el.getAttribute("data-revision-line")));
        return Array.from(set).sort((a, b) => a - b);
    }, [editor, format]);

    // Revisions the user ticked, kept to the ones still present in the script.
    const effectiveRevisions = selectedRevisions.filter((r) => availableRevisions.includes(r));

    const toggleRevision = (index: number) =>
        setSelectedRevisions((prev) =>
            prev.includes(index) ? prev.filter((r) => r !== index) : [...prev, index],
        );

    // Switch to "revisions" mode, seeding the selection with every revision so
    // the export is never empty until the user narrows it down.
    const selectRevisionsMode = () => {
        if (availableRevisions.length === 0) return;
        setPageMode("revisions");
        if (selectedRevisions.length === 0) setSelectedRevisions(availableRevisions);
    };

    if (!isLocalOnly && (!membership || !user)) return null;

    // --- Import Logic ---
    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const confirmImport = async () => {
            try {
                await importFileIntoProject(file, projectId, editor, titlePageEditor, repository);
            } catch (error) {
                console.error("Import failed:", error);
            }
        };

        importFilePopup(userContext, confirmImport);
        event.target.value = ""; // Reset input so the same file can be selected again if needed
    };

    const handleExport = async () => {
        setExporting(true);

        // Use membership title if available, otherwise use local title
        const projectTitle = membership?.project.title || localTitle;
        const authorEmail = user?.email || "Unknown";
        const projectAuthor = membership?.project.author || localAuthor || undefined;

        const baseOptions: BaseExportOptions = {
            title: projectTitle,
            author: authorEmail,
            projectAuthor,
            includeNotes,
            onProgress: (p) => { console.log("progress: ", p);setProgress(p) },
        };

        const adapter = getExportAdapter(format);
        if (!adapter) {
            console.error("Unsupported file type");
            return;
        }

        if (!ydoc) {
            console.error("No project state loaded");
            return;
        }

        if (format === ExportFormat.PDF) {
            // Page selection — "all" leaves it undefined (export everything).
            let pageSelection: PDFExportOptions["pageSelection"];
            if (pageMode === "ranges") {
                const ranges = parsePageRanges(pageRangesText);
                if (ranges.length > 0) pageSelection = { mode: "ranges", ranges };
            } else if (pageMode === "revisions" && effectiveRevisions.length > 0) {
                pageSelection = { mode: "revisions", revisions: effectiveRevisions };
            }

            const pdfOptions: PDFExportOptions = {
                ...baseOptions,
                format: pageFormat === "A4" ? "A4" : "LETTER",
                watermarkText: includeWatermark ? (watermarkText || undefined) : undefined,
                password: enablePassword && password ? password : undefined,
                displaySceneNumbers,
                                sceneHeadingSpacing,
                sceneNumberOnRight,
                contdLabel,
                moreLabel,
                editorElement: editor?.view?.dom,
                // Title page is omitted entirely when its toggle is off.
                titlePageElement: includeTitlePage ? titlePageEditor?.view?.dom : undefined,
                revisionExport,
                pageSelection,
            };
            await adapter.export(ydoc, pdfOptions as BaseExportOptions);
        } else if (format === ExportFormat.TEXT) {
            const textOptions: TextExportOptions = { ...baseOptions, includeTitlePage };
            await adapter.export(ydoc, textOptions as BaseExportOptions);
        } else if (format === ExportFormat.SCRIPTIO) {
            const scriptioOptions: ScriptioExportOptions = {
                ...baseOptions,
                readable: readableExport,
                projectId,
            };
            await adapter.export(ydoc, scriptioOptions as BaseExportOptions);
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
        { value: ExportFormat.TEXT, label: t("formatOptions.text") },
        { value: ExportFormat.SCRIPTIO, label: t("formatOptions.scriptio") },
    ];

    const revisionExportOptions: DropdownOption[] = [
        { value: "none", label: t("revisionExportOptions.none") },
        { value: "colored", label: t("revisionExportOptions.colored") },
        { value: "bw", label: t("revisionExportOptions.bw") },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            {/* --- Import Section --- */}
            <div className={sharedStyles.formGroup}>
                <div className={styles.sectionSeparator}>
                    <span className={sharedStyles.sectionTitle}>{t("importLabel")}</span>
                </div>

                {/* Hidden Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileImport}
                    accept={getSupportedImportExtensions()}
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
                <div className={styles.sectionSeparator}>
                    <span className={sharedStyles.sectionTitle}>{t("exportLabel")}</span>
                </div>
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
                    {format === ExportFormat.TEXT && t("formatHelp.text")}
                    {format === ExportFormat.SCRIPTIO && t("formatHelp.scriptio")}
                </p>
            </div>

            {/* --- Include Section --- */}
            <div className={sharedStyles.formGroup}>
                <span className={sharedStyles.sectionTitle}>{t("includeLabel")}</span>

                <div className={styles.includeGrid}>
                    {/* Notes */}
                    <div
                        className={`${optionCard.optionCard} ${styles.includeCard} ${includeNotes ? optionCard.active : ""}`}
                        onClick={() => setIncludeNotes(!includeNotes)}
                    >
                        <div className={optionCard.checkbox}>
                            {includeNotes && <div className={optionCard.checkInner} />}
                        </div>
                        <span className={optionCard.optionTitle}>{t("notes")}</span>
                    </div>

                    {/* Only the formats that lay out a title page of their own. */}
                    {(format === ExportFormat.PDF || format === ExportFormat.TEXT) && (
                        <div
                            className={`${optionCard.optionCard} ${styles.includeCard} ${includeTitlePage ? optionCard.active : ""}`}
                            onClick={() => setIncludeTitlePage(!includeTitlePage)}
                        >
                            <div className={optionCard.checkbox}>
                                {includeTitlePage && <div className={optionCard.checkInner} />}
                            </div>
                            <span className={optionCard.optionTitle}>{t("titlePage")}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Pages to export (PDF only): mutually exclusive choice --- */}
            {format === ExportFormat.PDF && (
                <div className={sharedStyles.formGroup}>
                    <span className={sharedStyles.sectionTitle}>{t("pageSelectionLabel")}</span>

                    <div className={styles.radioGroup}>
                        {/* All pages */}
                        <div
                            className={`${optionCard.optionCard} ${pageMode === "all" ? optionCard.active : ""}`}
                            onClick={() => setPageMode("all")}
                        >
                            <span className={`${styles.radio} ${pageMode === "all" ? styles.radioActive : ""}`}>
                                {pageMode === "all" && <span className={styles.radioDot} />}
                            </span>
                            <div className={optionCard.optionInfo}>
                                <span className={optionCard.optionTitle}>{t("allPages")}</span>
                                <span className={optionCard.optionDesc}>{t("allPagesDesc")}</span>
                            </div>
                        </div>

                        {/* Pages — explicit ranges */}
                        <div
                            className={`${optionCard.optionCard} ${optionCard.optionCardExpandable} ${
                                pageMode === "ranges" ? optionCard.active : ""
                            }`}
                            onClick={() => setPageMode("ranges")}
                        >
                            <div className={optionCard.optionRow}>
                                <span className={`${styles.radio} ${pageMode === "ranges" ? styles.radioActive : ""}`}>
                                    {pageMode === "ranges" && <span className={styles.radioDot} />}
                                </span>
                                <div className={optionCard.optionInfo}>
                                    <span className={optionCard.optionTitle}>{t("pageRanges")}</span>
                                    <span className={optionCard.optionDesc}>{t("pageRangesDesc")}</span>
                                </div>
                            </div>
                            {pageMode === "ranges" && (
                                <input
                                    value={pageRangesText}
                                    onChange={(e) => setPageRangesText(e.target.value)}
                                    placeholder={t("pageRangesPlaceholder")}
                                    className={`${sharedStyles.input} ${styles.passwordInput}`}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>

                        {/* Revisions — pick which revision colours to export */}
                        <div
                            className={`${optionCard.optionCard} ${optionCard.optionCardExpandable} ${
                                pageMode === "revisions" ? optionCard.active : ""
                            } ${availableRevisions.length === 0 ? styles.includeCardDisabled : ""}`}
                            onClick={selectRevisionsMode}
                        >
                            <div className={optionCard.optionRow}>
                                <span
                                    className={`${styles.radio} ${pageMode === "revisions" ? styles.radioActive : ""}`}
                                >
                                    {pageMode === "revisions" && <span className={styles.radioDot} />}
                                </span>
                                <div className={optionCard.optionInfo}>
                                    <span className={optionCard.optionTitle}>{t("revisions")}</span>
                                    <span className={optionCard.optionDesc}>{t("revisionsDesc")}</span>
                                </div>
                            </div>
                            {pageMode === "revisions" && availableRevisions.length > 0 && (
                                <div className={styles.revisionChips} onClick={(e) => e.stopPropagation()}>
                                    {availableRevisions.map((i) => {
                                        const on = selectedRevisions.includes(i);
                                        return (
                                            <button
                                                type="button"
                                                key={i}
                                                className={`${styles.revisionChip} ${on ? styles.revisionChipActive : ""}`}
                                                style={on ? { borderColor: REVISION_COLORS[i].value } : undefined}
                                                onClick={() => toggleRevision(i)}
                                            >
                                                <span
                                                    className={styles.revisionDot}
                                                    style={{ backgroundColor: REVISION_COLORS[i].value }}
                                                />
                                                {REVISION_COLORS[i].name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Readable JSON (Scriptio only) --- */}
            {format === ExportFormat.SCRIPTIO && (
                <div className={styles.options}>
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
                </div>
            )}

            {/* --- Security (PDF only): watermark + password --- */}
            {format === ExportFormat.PDF && (
                <div className={sharedStyles.formGroup}>
                    <span className={sharedStyles.sectionTitle}>{t("securityLabel")}</span>

                    <div className={styles.options}>
                        {/* Watermark */}
                        <div
                            className={`${optionCard.optionCard} ${optionCard.optionCardExpandable} ${
                                includeWatermark ? optionCard.active : ""
                            }`}
                            onClick={() => setIncludeWatermark(!includeWatermark)}
                        >
                            <div className={optionCard.optionRow}>
                                <div className={optionCard.checkbox}>
                                    {includeWatermark && <div className={optionCard.checkInner} />}
                                </div>
                                <div className={optionCard.optionInfo}>
                                    <span className={optionCard.optionTitle}>{t("watermark")}</span>
                                    <span className={optionCard.optionDesc}>{t("watermarkDesc")}</span>
                                </div>
                            </div>
                            {includeWatermark && (
                                <input
                                    value={watermarkText}
                                    onChange={(e) => setWatermarkText(e.target.value)}
                                    placeholder={t("watermarkPlaceholder")}
                                    className={`${sharedStyles.input} ${styles.passwordInput}`}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                        </div>

                        {/* Password protection */}
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
                    </div>
                </div>
            )}

            {/* --- Revision rendering (PDF only): none / coloured / black & white. --- */}
            {format === ExportFormat.PDF && (
                <div className={sharedStyles.formGroup}>
                    <span className={sharedStyles.sectionTitle}>{t("revisionExportLabel")}</span>
                    <Dropdown
                        value={revisionExport}
                        onChange={(value) => setRevisionExport(value as RevisionExportMode)}
                        options={revisionExportOptions}
                        className={`${sharedStyles.input} ${styles.input}`}
                    />
                </div>
            )}

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
