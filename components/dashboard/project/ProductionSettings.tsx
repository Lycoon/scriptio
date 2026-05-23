"use client";

import { useContext } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { ProjectContext } from "@src/context/ProjectContext";
import { TOGGLEABLE_SCENE_LETTERS } from "@src/lib/project/project-state";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import optionCard from "./OptionCard.module.css";
import styles from "./ProductionSettings.module.css";

const Arrow = () => <ArrowRight size={14} className={styles.arrowIcon} aria-hidden />;

const ProductionSettings = () => {
    const t = useTranslations("production");
    const {
        sceneNumberingStyle,
        setSceneNumberingStyle,
        skippedSceneLetters,
        setSkippedSceneLetters,
        isReadOnly,
    } = useContext(ProjectContext);

    const isLetterSkipped = (letter: string) =>
        skippedSceneLetters.includes(letter.toUpperCase());

    const toggleLetter = (letter: string) => {
        if (isReadOnly) return;
        const upper = letter.toUpperCase();
        const next = isLetterSkipped(upper)
            ? skippedSceneLetters.filter((l) => l.toUpperCase() !== upper)
            : [...skippedSceneLetters, upper];
        next.sort();
        setSkippedSceneLetters(next);
    };

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("numberingStyleTitle")}</label>
                <p className={sharedStyles.helpText}>{t("numberingStyleHelp")}</p>

                <div className={styles.styleOptions}>
                    <div
                        className={`${optionCard.optionCard} ${sceneNumberingStyle === "suffix" ? optionCard.active : ""}`}
                        onClick={() => !isReadOnly && setSceneNumberingStyle("suffix")}
                        role="radio"
                        aria-checked={sceneNumberingStyle === "suffix"}
                        aria-label={t("suffixName")}
                    >
                        <div className={optionCard.checkbox}>
                            {sceneNumberingStyle === "suffix" && <div className={optionCard.checkInner} />}
                        </div>
                        <span className={styles.styleName}>{t("suffixName")}</span>
                        <span className={styles.styleExample}>
                            <span>1</span>
                            <Arrow />
                            <span>1A</span>
                            <Arrow />
                            <span>2</span>
                        </span>
                    </div>
                    <div
                        className={`${optionCard.optionCard} ${sceneNumberingStyle === "prefix" ? optionCard.active : ""}`}
                        onClick={() => !isReadOnly && setSceneNumberingStyle("prefix")}
                        role="radio"
                        aria-checked={sceneNumberingStyle === "prefix"}
                        aria-label={t("prefixName")}
                    >
                        <div className={optionCard.checkbox}>
                            {sceneNumberingStyle === "prefix" && <div className={optionCard.checkInner} />}
                        </div>
                        <span className={styles.styleName}>{t("prefixName")}</span>
                        <span className={styles.styleExample}>
                            <span>1</span>
                            <Arrow />
                            <span>A2</span>
                            <Arrow />
                            <span>2</span>
                        </span>
                    </div>
                </div>
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("skippedLettersTitle")}</label>
                <p className={sharedStyles.helpText}>{t("skippedLettersHelp")}</p>

                <div className={styles.letterToggles}>
                    {TOGGLEABLE_SCENE_LETTERS.map((letter) => {
                        const active = isLetterSkipped(letter);
                        return (
                            <div
                                key={letter}
                                className={`${optionCard.optionCard} ${styles.letterCard} ${active ? optionCard.active : ""}`}
                                onClick={() => toggleLetter(letter)}
                                role="button"
                                aria-pressed={active}
                                aria-label={t("skipLetterAriaLabel", { letter })}
                            >
                                <div className={optionCard.checkbox}>
                                    {active && <div className={optionCard.checkInner} />}
                                </div>
                                <span className={styles.letter}>{letter}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ProductionSettings;
