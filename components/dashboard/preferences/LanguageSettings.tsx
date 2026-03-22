"use client";

import { useCallback, useMemo } from "react";
import { Check, Loader2 } from "lucide-react";
import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SpellcheckSettings.module.css";
import { UserLanguage } from "@src/lib/utils/types";
import { useLocale } from "@src/context/LocaleContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { DICTIONARY_CATALOG, formatDictionarySize } from "@src/lib/spellcheck/spellcheck-dictionaries";
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
    const {
        spellcheckLang,
        setSpellcheckLang,
        installedDictionaries,
        downloadProgress,
        installDictionary,
    } = useSpellcheck();

    const spellcheckOptions: DropdownOption[] = useMemo(() => {
        const noneOption: DropdownOption = {
            value: "none",
            label: t("spellcheckNone"),
        };

        const dictOptions: DropdownOption[] = DICTIONARY_CATALOG.map((dict) => {
            const installed = installedDictionaries.find((d) => d.code === dict.code);
            const isDownloading = downloadProgress?.code === dict.code;

            return {
                value: dict.code,
                label: (
                    <div className={styles.dictOption}>
                        <span>{dict.name}</span>
                        <span className={styles.dictMeta}>
                            {installed && <Check size={14} className={styles.checkmark} />}
                            {installed && (
                                <span className={styles.size}>{formatDictionarySize(installed.size)}</span>
                            )}
                            {isDownloading && <Loader2 size={14} className={styles.spinner} />}
                        </span>
                    </div>
                ),
                triggerLabel: installed ? dict.name : dict.name,
            };
        });

        return [noneOption, ...dictOptions];
    }, [installedDictionaries, downloadProgress, t]);

    const handleSpellcheckChange = useCallback(
        (value: string) => {
            if (value === "none") {
                setSpellcheckLang(null);
                return;
            }

            const isInstalled = installedDictionaries.some((d) => d.code === value);
            if (isInstalled) {
                setSpellcheckLang(value);
            } else {
                // Download and then auto-activate
                installDictionary(value);
            }
        },
        [installedDictionaries, setSpellcheckLang, installDictionary],
    );

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

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("spellcheckLabel")}</label>
                <Dropdown
                    value={spellcheckLang ?? "none"}
                    onChange={handleSpellcheckChange}
                    options={spellcheckOptions}
                    className={sharedStyles.input}
                />
                <p className={sharedStyles.helpText}>{t("spellcheckHelpText")}</p>
            </div>
        </div>
    );
};

export default LanguageSettings;
