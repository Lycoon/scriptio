"use client";

import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import { UserLanguage } from "@src/lib/utils/types";
import { useLocale } from "@src/context/LocaleContext";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";
import { useTranslations } from "next-intl";

const LANGUAGE_OPTIONS: DropdownOption[] = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "pl", label: "Polski" },
    { value: "zh", label: "中文" },
    { value: "ko", label: "한국어" },
    { value: "ja", label: "日本語" },
];

const LanguageSettings = () => {
    const { locale, setLanguage } = useLocale();
    const t = useTranslations("language");

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("label")}</label>
                <Dropdown
                    value={locale}
                    onChange={(value) => setLanguage(value as UserLanguage)}
                    options={LANGUAGE_OPTIONS}
                    className={sharedStyles.input}
                />
                <p className={sharedStyles.helpText}>{t("helpText")}</p>
            </div>
        </div>
    );
};

export default LanguageSettings;
