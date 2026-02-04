"use client";

import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { PageFormat } from "@src/lib/utils/enums";

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
                <input
                    type="text"
                    value={contdLabel}
                    onChange={(e) => setContdLabel(e.target.value)}
                    className={`${sharedStyles.input} ${styles.input}`}
                    placeholder="(CONT'D)"
                />
            </div>
        </div>
    );
};

export default LayoutSettings;
