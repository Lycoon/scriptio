"use client";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./AppearanceSettings.module.css";
import { UserTheme } from "@src/lib/utils/types";
import { editUserSettings } from "@src/lib/utils/requests";
import { useTheme } from "next-themes";

const AppearanceSettings = () => {
    const { theme, setTheme } = useTheme();

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
                </select>
                <p className={sharedStyles.helpText}>
                    {theme === "dark" && "Cozy, low-glare theme made for night owls and late-hour focus."}
                    {theme === "light" && "Crisp, airy theme that feels natural and comfortable during the day."}
                    {theme === "latte" && "Soft, cream-based theme that blends warmth with readability."}
                    {theme === "wonka" && "Velvety, cocoa-based theme that blends deep luxury with eye-resting focus"}
                    {theme === "mint" &&
                        "Refreshing, mint-infused theme that blends botanical serenity with eye-resting balance"}
                </p>
            </div>

            <div className={sharedStyles.formActions}>
                <button onClick={onSave} className={`${sharedStyles.formBtn} ${sharedStyles.success}`}>
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default AppearanceSettings;
