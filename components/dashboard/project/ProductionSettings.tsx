"use client";

import { useContext } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./ProjectSettings.module.css";
import styles from "./ProductionSettings.module.css";

const ProductionSettings = () => {
    const t = useTranslations("production");
    const { sceneNumberingStyle, setSceneNumberingStyle, isReadOnly } =
        useContext(ProjectContext);

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("numberingStyleTitle")}</label>
                <p className={sharedStyles.helpText}>{t("numberingStyleHelp")}</p>

                <div className={styles.styleOptions}>
                    <button
                        type="button"
                        className={`${styles.styleOption} ${sceneNumberingStyle === "suffix" ? styles.styleOptionActive : ""}`}
                        onClick={() => setSceneNumberingStyle("suffix")}
                        disabled={isReadOnly}
                    >
                        <span className={styles.styleExample}>{t("suffixExample")}</span>
                        <span className={styles.styleName}>{t("suffixName")}</span>
                    </button>
                    <button
                        type="button"
                        className={`${styles.styleOption} ${sceneNumberingStyle === "prefix" ? styles.styleOptionActive : ""}`}
                        onClick={() => setSceneNumberingStyle("prefix")}
                        disabled={isReadOnly}
                    >
                        <span className={styles.styleExample}>{t("prefixExample")}</span>
                        <span className={styles.styleName}>{t("prefixName")}</span>
                    </button>
                </div>

                <p className={styles.note}>{t("appliesToNewOnly")}</p>
            </div>
        </div>
    );
};

export default ProductionSettings;
