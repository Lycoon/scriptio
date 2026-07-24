"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Download, Loader2, Mic, Plus, SpellCheck, X } from "lucide-react";
import form from "./../../utils/Form.module.css";
import sharedStyles from "../project/ProjectSettings.module.css";
import styles from "./SpellcheckSettings.module.css";
import { UserLanguage } from "@src/lib/utils/types";
import { useLocale } from "@src/context/LocaleContext";
import { useSettings } from "@src/lib/utils/hooks";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { useReadAloud } from "@src/context/ReadAloudContext";
import { ProjectContext } from "@src/context/ProjectContext";
import {
    BUILTIN_DICTIONARY_CODE,
    DICTIONARY_CATALOG,
    formatDictionarySize,
} from "@src/lib/spellcheck/spellcheck-dictionaries";
import { VOICE_CATALOG, formatVoiceSize } from "@src/lib/tts/voice-catalog";
import { MODEL_VARIANTS, ModelQuality } from "@src/lib/tts/runtime";
import { getDictationLanguage, isDictationSupported, setDictationLanguage } from "@src/lib/editor/use-dictation";
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
    const { saveSettings } = useSettings();
    const t = useTranslations("language");
    const { spellcheckLang, setSpellcheckLang, installedDictionaries, downloadProgress, installDictionary } =
        useSpellcheck();
    const {
        installedModels,
        activeModel,
        downloadingModel,
        downloadProgress: voiceProgress,
        gpuAvailable,
        installModel,
        removeModel,
        setActiveModel,
    } = useReadAloud();
    const { repository } = useContext(ProjectContext);

    const [wordInput, setWordInput] = useState("");
    const [dictOpen, setDictOpen] = useState(false);
    const [customWords, setCustomWords] = useState<string[]>([]);

    // Dictation (footer mic) language — a device preference read/written directly
    // to localStorage. Only meaningful where the browser has speech recognition.
    const dictationSupported = useMemo(() => isDictationSupported(), []);
    const [dictationLang, setDictationLangState] = useState(() => getDictationLanguage());
    const handleDictationChange = useCallback((value: string) => {
        setDictationLangState(value);
        setDictationLanguage(value);
    }, []);

    // Same shape as the spell-check options: a mic icon marks the trigger.
    const dictationOptions: DropdownOption[] = useMemo(
        () =>
            LANGUAGE_OPTIONS.map((opt) => ({
                ...opt,
                triggerLabel: (
                    <span className={styles.triggerLabel}>
                        <Mic size={14} className={styles.triggerIcon} />
                        {opt.label}
                    </span>
                ),
            })),
        [],
    );

    const dictMap = useMemo(() => repository?.getState()?.dictionary() ?? null, [repository]);

    // Sync word list from Yjs map and observe live changes
    useEffect(() => {
        if (!dictMap) return;

        const sync = () => {
            const words: string[] = [];
            dictMap.forEach((_, word) => words.push(word));
            setCustomWords(words.sort());
        };

        sync();
        dictMap.observe(sync);
        return () => {
            dictMap.unobserve(sync);
            setCustomWords([]);
        };
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
        return DICTIONARY_CATALOG.map((dict) => {
            const isBuiltin = dict.code === BUILTIN_DICTIONARY_CODE;
            const installed = installedDictionaries.find((d) => d.code === dict.code);
            const isDownloading = downloadProgress?.code === dict.code;

            return {
                value: dict.code,
                label: (
                    <div className={styles.dictOption}>
                        <span>{dict.name}</span>
                        <span className={styles.dictMeta}>
                            {isBuiltin ? (
                                <>
                                    <span className={styles.size}>{t("spellcheckBuiltin")}</span>
                                    <Check size={14} className={styles.checkmark} />
                                </>
                            ) : isDownloading ? (
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
                triggerLabel: (
                    <span className={styles.triggerLabel}>
                        <SpellCheck size={14} className={styles.triggerIcon} />
                        {dict.name}
                    </span>
                ),
            };
        });
    }, [installedDictionaries, downloadProgress, t]);

    const handleSpellcheckChange = useCallback(
        (value: string) => {
            const isInstalled = value === BUILTIN_DICTIONARY_CODE || installedDictionaries.some((d) => d.code === value);
            if (isInstalled) {
                setSpellcheckLang(value);
            } else {
                installDictionary(value);
            }
        },
        [installedDictionaries, setSpellcheckLang, installDictionary],
    );

    const modelDownloadPct =
        voiceProgress && voiceProgress.total > 0
            ? Math.round((voiceProgress.loaded / voiceProgress.total) * 100)
            : null;

    // Read Aloud runs on the GPU, so without one the model is unavailable.
    const gpuMissing = gpuAvailable === false;
    const modelNameKey: Record<ModelQuality, string> = {
        high: "ttsModelHigh",
    };

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("label")}</label>
                <p className={sharedStyles.helpText}>{t("helpText")}</p>
                <Dropdown
                    value={locale}
                    onChange={(value) => { setLanguage(value as UserLanguage); saveSettings({ language: value as UserLanguage }); }}
                    options={LANGUAGE_OPTIONS}
                    className={sharedStyles.input}
                />
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("spellcheckLabel")}</label>
                <p className={sharedStyles.helpText}>{t("spellcheckHelpText")}</p>
                <Dropdown
                    value={spellcheckLang ?? "en"}
                    onChange={handleSpellcheckChange}
                    options={spellcheckOptions}
                    className={sharedStyles.input}
                />
            </div>

            {dictationSupported && (
                <div className={sharedStyles.formGroup}>
                    <label className={form.label}>{t("dictationLabel")}</label>
                    <p className={sharedStyles.helpText}>{t("dictationHelpText")}</p>
                    <Dropdown
                        value={dictationLang}
                        onChange={handleDictationChange}
                        options={dictationOptions}
                        className={sharedStyles.input}
                    />
                </div>
            )}

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

            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("ttsLabel")}</label>
                <p className={sharedStyles.helpText}>{t("ttsHelpText", { count: VOICE_CATALOG.length })}</p>
                <div className={styles.voiceList}>
                    {MODEL_VARIANTS.map((m) => {
                        const installed = installedModels[m.quality];
                        const isActive = activeModel === m.quality;
                        const isDownloading = downloadingModel === m.quality;
                        const onRowClick = () => {
                            if (isDownloading || gpuMissing) return;
                            if (!installed) installModel(m.quality);
                            else if (!isActive) setActiveModel(m.quality);
                        };
                        return (
                            <div
                                key={m.quality}
                                className={`${styles.voiceRow} ${isActive ? styles.voiceInstalled : ""} ${gpuMissing ? styles.voiceDisabled : ""}`}
                                onClick={onRowClick}
                            >
                                <span className={styles.voiceNameWrap}>
                                    <span className={styles.voiceName}>{t(modelNameKey[m.quality])}</span>
                                </span>
                                <span className={styles.dictMeta}>
                                    {isDownloading ? (
                                        <>
                                            {modelDownloadPct !== null && (
                                                <span className={styles.percent}>{modelDownloadPct}%</span>
                                            )}
                                            <Loader2 size={14} className={styles.spinner} />
                                        </>
                                    ) : gpuMissing ? (
                                        <span className={styles.size}>{formatVoiceSize(m.size)}</span>
                                    ) : installed ? (
                                        <>
                                            {isActive ? (
                                                <span className={styles.activeTag}>{t("ttsActive")}</span>
                                            ) : (
                                                <span className={styles.activateTag}>{t("ttsActivate")}</span>
                                            )}
                                            <span className={styles.size}>{formatVoiceSize(m.size)}</span>
                                            <button
                                                className={styles.voiceRemove}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeModel(m.quality);
                                                }}
                                                aria-label={t("ttsRemove")}
                                                title={t("ttsRemove")}
                                            >
                                                <X size={13} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className={styles.size}>{formatVoiceSize(m.size)}</span>
                                            <Download size={14} className={styles.download} />
                                        </>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {gpuMissing && <p className={sharedStyles.helpText}>{t("ttsNoGpuHelp")}</p>}
            </div>
        </div>
    );
};

export default LanguageSettings;
