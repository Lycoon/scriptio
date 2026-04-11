"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Download, Loader2, Plus, X } from "lucide-react";
import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SpellcheckSettings.module.css";
import { UserLanguage } from "@src/lib/utils/types";
import { useLocale } from "@src/context/LocaleContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { ProjectContext } from "@src/context/ProjectContext";
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
    const { spellcheckLang, setSpellcheckLang, installedDictionaries, downloadProgress, installDictionary } =
        useSpellcheck();
    const { repository } = useContext(ProjectContext);

    const [wordInput, setWordInput] = useState("");
    const [dictOpen, setDictOpen] = useState(false);
    const [customWords, setCustomWords] = useState<string[]>([]);

    const dictMap = useMemo(() => repository?.getState()?.dictionary() ?? null, [repository]);

    // Sync word list from Yjs map and observe live changes
    useEffect(() => {
        if (!dictMap) {
            setCustomWords([]);
            return;
        }

        const sync = () => {
            const words: string[] = [];
            dictMap.forEach((_, word) => words.push(word));
            setCustomWords(words.sort());
        };

        sync();
        dictMap.observe(sync);
        return () => dictMap.unobserve(sync);
    }, [dictMap]);

    const handleAddWord = useCallback(() => {
        const trimmed = wordInput.trim();
        if (!trimmed || !dictMap) return;
        dictMap.set(trimmed, true);
        setWordInput("");
    }, [wordInput, dictMap]);

    const handleRemoveWord = useCallback(
        (word: string) => {
            dictMap?.delete(word);
        },
        [dictMap],
    );

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
                            {isDownloading ? (
                                <Loader2 size={14} className={styles.spinner} />
                            ) : installed ? (
                                <>
                                    <span className={styles.size}>{formatDictionarySize(installed.size)}</span>
                                    <Check size={14} className={styles.checkmark} />
                                </>
                            ) : (
                                <Download size={14} className={styles.download} />
                            )}
                        </span>
                    </div>
                ),
                triggerLabel: dict.name,
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
                installDictionary(value);
            }
        },
        [installedDictionaries, setSpellcheckLang, installDictionary],
    );

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("label")}</label>
                <p className={sharedStyles.helpText}>{t("helpText")}</p>
                <Dropdown
                    value={locale}
                    onChange={(value) => setLanguage(value as UserLanguage)}
                    options={LANGUAGE_OPTIONS}
                    className={sharedStyles.input}
                />
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("spellcheckLabel")}</label>
                <p className={sharedStyles.helpText}>{t("spellcheckHelpText")}</p>
                <Dropdown
                    value={spellcheckLang ?? "none"}
                    onChange={handleSpellcheckChange}
                    options={spellcheckOptions}
                    className={sharedStyles.input}
                />
            </div>

            {spellcheckLang && dictMap && (
                <div className={sharedStyles.formGroup}>
                    <div className={styles.dictCard}>
                        <div className={styles.dictCardHeader} onClick={() => setDictOpen((o) => !o)}>
                            <div className={styles.dictCardHeaderLeft}>
                                <span className={styles.dictCardTitle}>{t("customDictLabel")}</span>
                                {customWords.length > 0 && (
                                    <span className={styles.dictCardBadge}>{customWords.length}</span>
                                )}
                            </div>
                            <ChevronDown
                                size={16}
                                className={`${styles.dictCardChevron} ${dictOpen ? styles.open : ""}`}
                            />
                        </div>

                        {dictOpen && (
                            <div className={styles.dictCardBody}>
                                <div className={styles.wordInputRow}>
                                    <input
                                        value={wordInput}
                                        onChange={(e) => setWordInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleAddWord();
                                        }}
                                    />
                                    <button
                                        className={styles.addBtn}
                                        onClick={handleAddWord}
                                        disabled={!wordInput.trim()}
                                    >
                                        <Plus size={14} />
                                        {t("customDictAdd")}
                                    </button>
                                </div>
                                <div className={styles.wordList}>
                                    {customWords.length > 0 ? (
                                        customWords.map((word) => (
                                            <div key={word} className={styles.wordItem}>
                                                <span>{word}</span>
                                                <button
                                                    className={styles.removeWordBtn}
                                                    onClick={() => handleRemoveWord(word)}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className={styles.emptyState}>{t("customDictEmpty")}</div>
                                    )}
                                </div>
                                <p className={sharedStyles.helpText}>{t("customDictHelpText")}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LanguageSettings;
