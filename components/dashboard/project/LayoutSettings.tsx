"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { PageFormat } from "@src/lib/utils/enums";
import { Check } from "lucide-react";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";
import optionCard from "./OptionCard.module.css";

const LayoutSettings = () => {
    const t = useTranslations("layout");
    const {
        pageFormat,
        setPageFormat,
        displaySceneNumbers,
        setDisplaySceneNumbers,
        sceneHeadingBold,
        setSceneHeadingBold,
        sceneHeadingDoubleSpace,
        setSceneHeadingDoubleSpace,
        sceneNumberOnRight,
        setSceneNumberOnRight,
        contdLabel,
        setContdLabel,
        moreLabel,
        setMoreLabel,
    } = useContext(ProjectContext);

    // Strip wrapping parentheses for display — the system stores "(CONT'D)" but the
    // user should only type the inner text; parentheses are added back on commit.
    const stripParens = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

    // Local state for the continuation input to avoid triggering editor.commands.focus()
    // on every keystroke (which steals focus from the input and causes freezes)
    const [localContdLabel, setLocalContdLabel] = useState(() => stripParens(contdLabel));
    const [localMoreLabel, setLocalMoreLabel] = useState(() => stripParens(moreLabel));

    const hasContdChanges = `(${localContdLabel})` !== contdLabel;
    const hasMoreChanges = `(${localMoreLabel})` !== moreLabel;

    const commitContdLabel = () => {
        if (hasContdChanges) setContdLabel(`(${localContdLabel})`);
    };

    const commitMoreLabel = () => {
        if (hasMoreChanges) setMoreLabel(`(${localMoreLabel})`);
    };

    // Keep local state in sync when the context value changes externally (e.g. collaboration)
    useEffect(() => {
        setLocalContdLabel(stripParens(contdLabel));
    }, [contdLabel]);

    useEffect(() => {
        setLocalMoreLabel(stripParens(moreLabel));
    }, [moreLabel]);

    const handleFormatChange = (newFormat: PageFormat) => {
        setPageFormat(newFormat);
    };

    const pageFormatOptions: DropdownOption[] = [
        { value: "LETTER", label: 'US Letter (8.5" x 11")' },
        { value: "A4", label: "A4 (210mm x 297mm)" },
    ];

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("pageFormat")}</label>
                <Dropdown
                    value={pageFormat}
                    onChange={(value) => handleFormatChange(value as PageFormat)}
                    options={pageFormatOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
                <p className={sharedStyles.helpText}>
                    {pageFormat === "LETTER" && t("pageFormatHelp.letter")}
                    {pageFormat === "A4" && t("pageFormatHelp.a4")}
                </p>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("sceneHeadings")}</label>
                <div
                    className={`${optionCard.optionCard} ${sceneHeadingBold ? optionCard.active : ""}`}
                    onClick={() => setSceneHeadingBold(!sceneHeadingBold)}
                >
                    <div className={optionCard.checkbox}>
                        {sceneHeadingBold && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("bold")}</span>
                        <span className={optionCard.optionDesc}>{t("boldDesc")}</span>
                    </div>
                </div>

                <div
                    className={`${optionCard.optionCard} ${sceneHeadingDoubleSpace ? optionCard.active : ""}`}
                    onClick={() => setSceneHeadingDoubleSpace(!sceneHeadingDoubleSpace)}
                >
                    <div className={optionCard.checkbox}>
                        {sceneHeadingDoubleSpace && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("extraSpace")}</span>
                        <span className={optionCard.optionDesc}>{t("extraSpaceDesc")}</span>
                    </div>
                </div>

                <div
                    className={`${optionCard.optionCard} ${optionCard.optionCardExpandable} ${
                        displaySceneNumbers ? optionCard.active : ""
                    }`}
                    onClick={() => setDisplaySceneNumbers(!displaySceneNumbers)}
                >
                    <div className={optionCard.optionRow}>
                        <div className={optionCard.checkbox}>
                            {displaySceneNumbers && <div className={optionCard.checkInner} />}
                        </div>
                        <div className={optionCard.optionInfo}>
                            <span className={optionCard.optionTitle}>{t("sceneNumbering")}</span>
                            <span className={optionCard.optionDesc}>{t("sceneNumberingDesc")}</span>
                        </div>
                    </div>
                    {displaySceneNumbers && (
                        <div
                            className={`${styles.subOption} ${optionCard.optionCard} ${
                                sceneNumberOnRight ? optionCard.active : ""
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSceneNumberOnRight(!sceneNumberOnRight);
                            }}
                        >
                            <div className={optionCard.checkbox}>
                                {sceneNumberOnRight && <div className={optionCard.checkInner} />}
                            </div>
                            <div className={optionCard.optionInfo}>
                                <span className={optionCard.optionTitle}>{t("duplicateRight")}</span>
                                <span className={optionCard.optionDesc}>{t("duplicateRightDesc")}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("continuation")}</label>
                <div className={styles.contdInputRow}>
                    <input
                        type="text"
                        value={localMoreLabel}
                        onChange={(e) => setLocalMoreLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitMoreLabel();
                        }}
                        className={`${sharedStyles.input} ${styles.input}`}
                        placeholder="MORE"
                    />
                    <button
                        className={`${styles.contdConfirmBtn} ${hasMoreChanges ? styles.contdConfirmBtnActive : ""}`}
                        disabled={!hasMoreChanges}
                        onClick={commitMoreLabel}
                        title={t("moreTitle")}
                    >
                        <Check size={16} />
                    </button>
                </div>

                <div className={styles.contdInputRow} style={{ marginTop: '0.5rem' }}>
                    <input
                        type="text"
                        value={localContdLabel}
                        onChange={(e) => setLocalContdLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitContdLabel();
                        }}
                        className={`${sharedStyles.input} ${styles.input}`}
                        placeholder="CONT'D"
                    />
                    <button
                        className={`${styles.contdConfirmBtn} ${hasContdChanges ? styles.contdConfirmBtnActive : ""}`}
                        disabled={!hasContdChanges}
                        onClick={commitContdLabel}
                        title={t("contdTitle")}
                    >
                        <Check size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LayoutSettings;
