"use client";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import optionCard from "../project/OptionCard.module.css";
import styles from "./AppearanceSettings.module.css";
import { UserTheme } from "@src/lib/utils/types";
import { editUserSettings } from "@src/lib/utils/requests";
import { useTheme } from "next-themes";
import { useSettings } from "@src/lib/utils/hooks";

const AppearanceSettings = () => {
    const { theme, setTheme } = useTheme();
    const { settings, mutate } = useSettings();

    const themedEditor = settings?.themedEditor ?? false;

    const toggleThemedEditor = () => {
        const newValue = !themedEditor;
        // Optimistically update the SWR cache so the toggle reflects immediately,
        // then persist to the backend. EditorThemeSync picks up the cache change
        // and syncs the CSS class on <html>.
        mutate({ ...settings!, themedEditor: newValue }, false);
        editUserSettings({ themedEditor: newValue });
    };

    const onSave = () => {
        editUserSettings({ theme: theme as UserTheme });
    };

    return (
        <div className={sharedStyles.settingsForm}>
            {/* Theme Selection */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Theme</label>
                <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className={`${sharedStyles.input} ${styles.input}`}
                >
                    <option value={"dark"}>Dark</option>
                    <option value={"light"}>Light</option>
                    <option value={"latte"}>Latte</option>
                    <option value={"wonka"}>Wonka</option>
                    <option value={"mint"}>Mint</option>
                    <option value={"blossom"}>Blossom</option>
                </select>
                <p className={sharedStyles.helpText}>
                    {theme === "dark" && "Cozy, low-glare theme made for night owls and late-hour focus."}
                    {theme === "light" && "Crisp, airy theme that feels natural and comfortable during the day."}
                    {theme === "latte" && "Soft, cream-based theme that blends warmth with readability."}
                    {theme === "wonka" && "Velvety, cocoa-based theme that blends deep luxury with eye-resting focus"}
                    {theme === "mint" &&
                        "Refreshing, mint-infused theme that blends botanical serenity with eye-resting balance"}
                    {theme === "blossom" &&
                        "Gentle, petal-infused theme that blends floral warmth with eye-resting softness"}
                </p>
            </div>

            {/* Editor Appearance */}
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Editor</label>
                <div
                    className={`${optionCard.optionCard} ${themedEditor ? optionCard.active : ""}`}
                    onClick={toggleThemedEditor}
                >
                    <div className={optionCard.checkbox}>
                        {themedEditor && <div className={optionCard.checkInner} />}
                    </div>
                    <div className={optionCard.optionInfo}>
                        <span className={optionCard.optionTitle}>Themed editor</span>
                        <span className={optionCard.optionDesc}>
                            Use theme colors for the editor background and text
                        </span>
                    </div>
                </div>
            </div>

            <div className={sharedStyles.formActions}>
                <button onClick={onSave} className={`${sharedStyles.formBtn} `}>
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default AppearanceSettings;
