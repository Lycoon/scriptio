"use client";

import { useContext, useEffect, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { PageFormat } from "@src/lib/utils/enums";
import { Check } from "lucide-react";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./LayoutSettings.module.css";
import optionCard from "./OptionCard.module.css";

const LayoutSettings = () => {
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
    } = useContext(ProjectContext);

    // Strip wrapping parentheses for display — the system stores "(CONT'D)" but the
    // user should only type the inner text; parentheses are added back on commit.
    const stripParens = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

    // Local state for the continuation input to avoid triggering editor.commands.focus()
    // on every keystroke (which steals focus from the input and causes freezes)
    const [localContdLabel, setLocalContdLabel] = useState(() => stripParens(contdLabel));
    const hasContdChanges = `(${localContdLabel})` !== contdLabel;

    const commitContdLabel = () => {
        if (hasContdChanges) setContdLabel(`(${localContdLabel})`);
    };

    // Keep local state in sync when the context value changes externally (e.g. collaboration)
    useEffect(() => {
        setLocalContdLabel(stripParens(contdLabel));
    }, [contdLabel]);

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
                    <option value="LETTER">US Letter (8.5" x 11")</option>
                    <option value="A4">A4 (210mm x 297mm)</option>
                </select>
                <p className={sharedStyles.helpText}>
                    {pageFormat === "LETTER" &&
                        "Standard format used in the United States. Industry standard for Hollywood screenplays."}
                    {pageFormat === "A4" && "International standard format. Common in Europe and most other countries."}
                </p>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Scene Headings</label>
                <div
                    className={`${optionCard.optionCard} ${sceneHeadingBold ? optionCard.active : ""}`}
                    onClick={() => setSceneHeadingBold(!sceneHeadingBold)}
                >
                    <div className={optionCard.checkbox}>
                        {sceneHeadingBold && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>Bold</span>
                        <span className={optionCard.optionDesc}>Scene headings will appear in bold</span>
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
                        <span className={optionCard.optionTitle}>Extra space above</span>
                        <span className={optionCard.optionDesc}>Add extra spacing before scene headings</span>
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
                            <span className={optionCard.optionTitle}>Scene numbering</span>
                            <span className={optionCard.optionDesc}>Show scene numbers in left margin</span>
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
                                <span className={optionCard.optionTitle}>Duplicate in right margin</span>
                                <span className={optionCard.optionDesc}>Show number on both sides</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Continuation</label>
                <div className={styles.contdInputRow}>
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
                        title="Apply continuation label"
                    >
                        <Check size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LayoutSettings;
