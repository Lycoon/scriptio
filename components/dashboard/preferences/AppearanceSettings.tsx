"use client";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import optionCard from "../project/OptionCard.module.css";
import styles from "./AppearanceSettings.module.css";
import { UserTheme } from "@src/lib/utils/types";
import { useTheme } from "next-themes";
import { useSettings } from "@src/lib/utils/hooks";
import { useTranslations } from "next-intl";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";

const THEME_COLORS: Record<
    string,
    { primary: string; secondary: string; tertiary: string; text: string; subtext: string }
> = {
    dark: {
        primary: "#1d1d1d",
        secondary: "#2e2e2e",
        tertiary: "#3a3a3a",
        text: "#ffffff",
        subtext: "#9b9b9b",
    },
    light: {
        primary: "#f3f3f3",
        secondary: "#ffffff",
        tertiary: "#e2e2e2",
        text: "#1a1a1c",
        subtext: "#64748b",
    },
    latte: {
        primary: "#f7edd9",
        secondary: "#fff8e9",
        tertiary: "#ecdab4",
        text: "#7a6129",
        subtext: "#c09c50",
    },
    wonka: {
        primary: "#1e1410",
        secondary: "#2c1e1a",
        tertiary: "#4d3b36",
        text: "#e6dcca",
        subtext: "#a89b91",
    },
    mint: {
        primary: "#dcf5de",
        secondary: "#ecfdec",
        tertiary: "#bce0bc",
        text: "#354937",
        subtext: "#7d977f",
    },
    blossom: {
        primary: "#ffe7f3",
        secondary: "#fff6fb",
        tertiary: "#ffbbdd",
        text: "#bb4bbb",
        subtext: "#a579a5",
    },
};

const THEME_LABELS: Record<string, string> = {
    dark: "Dark",
    light: "Light",
    latte: "Latte",
    wonka: "Wonka",
    mint: "Mint",
    blossom: "Blossom",
};

const AppearanceSettings = () => {
    const { theme, setTheme } = useTheme();
    const { settings, mutate, saveSettings } = useSettings();
    const t = useTranslations("appearance");

    const themedEditor = settings?.themedEditor ?? false;
    const highlightOnHover = settings?.highlightOnHover ?? false;

    const toggleThemedEditor = () => {
        const newValue = !themedEditor;
        mutate({ ...settings!, themedEditor: newValue }, false);
        saveSettings({ themedEditor: newValue });
    };

    const toggleHighlightOnHover = () => {
        const newValue = !highlightOnHover;
        mutate({ ...settings!, highlightOnHover: newValue }, false);
        saveSettings({ highlightOnHover: newValue });
    };

    const themeOptions: DropdownOption[] = Object.entries(THEME_COLORS).map(([key, colors]) => ({
        value: key,
        triggerLabel: (
            <div className={styles.color_preview}>
                <div className={styles.swatch} style={{ backgroundColor: colors.primary }} />
                <div className={styles.swatch} style={{ backgroundColor: colors.secondary }} />
                <div className={styles.swatch} style={{ backgroundColor: colors.tertiary }} />
                <span style={{ marginLeft: "8px" }}>{THEME_LABELS[key]}</span>
            </div>
        ),
        label: (
            <div className={styles.color_preview}>
                <div className={styles.swatch} style={{ backgroundColor: colors.primary }} title="Primary" />
                <div className={styles.swatch} style={{ backgroundColor: colors.secondary }} title="Secondary" />
                <div className={styles.swatch} style={{ backgroundColor: colors.tertiary }} title="Tertiary" />
                <span style={{ marginLeft: "8px" }}>{THEME_LABELS[key]}</span>
            </div>
        ),
    }));

    return (
        <div className={sharedStyles.settingsForm}>
            {/* Theme Selection */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("theme")}</label>
                <Dropdown
                    value={theme || "dark"}
                    onChange={(value) => {
                        setTheme(value);
                        saveSettings({ theme: value as UserTheme });
                    }}
                    options={themeOptions}
                    className={`${sharedStyles.input} ${styles.input}`}
                />
                <p className={sharedStyles.helpText}>{theme && t(`themeHelp.${theme}`)}</p>
            </div>

            {/* Editor Appearance */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("editor")}</label>
                <div
                    className={`${optionCard.optionCard} ${themedEditor ? optionCard.active : ""}`}
                    onClick={toggleThemedEditor}
                >
                    <div className={optionCard.checkbox}>
                        {themedEditor && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("themedEditor")}</span>
                        <span className={optionCard.optionDesc}>{t("themedEditorDesc")}</span>
                    </div>
                </div>
                <div
                    className={`${optionCard.optionCard} ${highlightOnHover ? optionCard.active : ""}`}
                    onClick={toggleHighlightOnHover}
                >
                    <div className={optionCard.checkbox}>
                        {highlightOnHover && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>{t("highlightOnHover")}</span>
                        <span className={optionCard.optionDesc}>{t("highlightOnHoverDesc")}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppearanceSettings;
