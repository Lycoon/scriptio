"use client";

import { useEffect, useRef, useState } from "react";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./../project/ProjectSettings.module.css";
import styles from "./KeybindsSettings.module.css";

import { useSettings } from "@src/lib/utils/hooks";
import { tinykeys } from "@node_modules/tinykeys/dist/tinykeys";
import { DEFAULT_KEYBINDS, DefaultKeyBind, prettyPrintKeybind, UserKeybindsMap } from "@src/lib/utils/keybinds";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";

export type KeybindElementProps = {
    id: string;
    kb: DefaultKeyBind;
    startListening: (id: string) => void;
    resetBinding: (id: string) => void;
    current?: string; // user override (not effective combo)
    isListening: boolean;
    tempCombo: string | null;
};

const KeybindElement = ({
    id,
    kb,
    current,
    tempCombo,
    resetBinding,
    isListening,
    startListening,
}: KeybindElementProps) => {
    const effective = current || kb.defaultCombo;
    const t = useTranslations("keybinds");

    return (
        <div key={id} className={styles.optionCard}>
            <div className={styles.optionInfo}>
                <span className={styles.optionTitle}>{kb.label}</span>
                <span className={styles.optionDesc}>{t("defaultPrefix", { combo: prettyPrintKeybind(kb.defaultCombo) })}</span>
            </div>

            <div className={styles.keyAreaWrap}>
                <div
                    role="button"
                    tabIndex={0}
                    className={styles.keyArea}
                    onClick={() => startListening(id)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startListening(id);
                        }
                    }}
                >
                    {isListening ? (
                        <span className={styles.keyText}>{t("typing")}</span>
                    ) : tempCombo && isListening ? (
                        <span className={styles.keyText}>{prettyPrintKeybind(tempCombo)}</span>
                    ) : effective ? (
                        <span className={styles.keyText}>{prettyPrintKeybind(effective)}</span>
                    ) : (
                        <span className={styles.keyText}>{t("notSet")}</span>
                    )}
                </div>

                <div className={styles.keyAreaActions}>
                    <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={() => resetBinding(id)}
                        title={t("resetTitle")}
                    >
                        {t("reset")}
                    </button>
                </div>
            </div>
        </div>
    );
};

const KeybindsSettings = () => {
    const { settings, saveSettings } = useSettings();

    const t = useTranslations("keybinds");
    const [userKeybinds, setUserKeybinds] = useState<UserKeybindsMap>(settings?.keybinds ?? {});
    const [listeningFor, setListeningFor] = useState<string | null>(null);
    const [tempCombo, setTempCombo] = useState<string | null>(null);
    const [hasUpdatedKeybinds, setHasUpdatedKeybinds] = useState(false);
    const tinykeysStopRef = useRef<(() => void) | null>(null);
    const [prevSettings, setPrevSettings] = useState(settings);
    if (prevSettings !== settings) {
        setPrevSettings(settings);
        setUserKeybinds(settings?.keybinds ?? {});
    }

    useEffect(() => {
        if (tinykeysStopRef.current) {
            tinykeysStopRef.current();
            tinykeysStopRef.current = null;
        }

        const mapping: Record<string, (e: KeyboardEvent) => void> = {};
        Object.entries(DEFAULT_KEYBINDS).forEach(([id, def]) => {
            const combo = (userKeybinds[id] || def.defaultCombo || "").toLowerCase();
            if (!combo) return;
            mapping[combo] = (e: KeyboardEvent) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("app:keybind", { detail: { id } }));
            };
        });

        try {
            tinykeysStopRef.current = tinykeys(window, mapping);
        } catch (err) {
            console.warn("tinykeys registration failed:", err);
            tinykeysStopRef.current = null;
        }

        return () => {
            if (tinykeysStopRef.current) {
                tinykeysStopRef.current();
                tinykeysStopRef.current = null;
            }
        };
    }, [userKeybinds]);

    const formatComboFromEvent = (e: KeyboardEvent) => {
        const parts: string[] = [];

        const hasMod = e.ctrlKey || e.metaKey;
        if (hasMod) parts.push("$mod");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");

        let key = e.key || "";
        const lower = key.toLowerCase();

        if (lower === " ") key = "space";
        const main = key.length === 1 ? key.toLowerCase() : lower;

        if (["shift", "ctrl", "control", "meta", "alt"].includes(main)) return null;

        parts.push(main);
        return parts.join("+");
    };

    useEffect(() => {
        if (!listeningFor) return;

        const onKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            const combo = formatComboFromEvent(e);
            if (!combo) {
                setTempCombo(t("modifiersOnly"));
                return;
            }
            setTempCombo(combo);
            setHasUpdatedKeybinds(true);

            setUserKeybinds((prev) => {
                const next = { ...prev, [listeningFor]: combo };
                saveSettings({ keybinds: next });
                return next;
            });

            setListeningFor(null);
            setTimeout(() => setTempCombo(null), 400);
        };

        const onCancel = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setListeningFor(null);
                setTempCombo(null);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keydown", onCancel);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keydown", onCancel);
        };
    }, [listeningFor, saveSettings, t]);

    const startListening = (id: string) => {
        setListeningFor(id);
        setTempCombo(null);
    };

    const resetBinding = (id: string) => {
        setUserKeybinds((prev) => {
            const next = { ...prev };
            if (next[id]) setHasUpdatedKeybinds(true);

            delete next[id];
            saveSettings({ keybinds: next });
            return next;
        });
    };

    const resetDefaults = () => {
        setUserKeybinds({});
        setHasUpdatedKeybinds(true);
        saveSettings({ keybinds: {} });
    };

    const saveChanges = () => {
        setHasUpdatedKeybinds(false);
        saveSettings({ keybinds: userKeybinds });
    };

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>{t("screenplayElements")}</label>
            </div>

            <div className={styles.options}>
                {Object.entries(DEFAULT_KEYBINDS).map(([id, kb]) => {
                    const userOverride = userKeybinds[id];
                    const isListening = listeningFor === id;

                    return (
                        <KeybindElement
                            key={id}
                            id={id}
                            kb={kb}
                            resetBinding={resetBinding}
                            tempCombo={tempCombo}
                            current={userOverride}
                            isListening={isListening}
                            startListening={startListening}
                        />
                    );
                })}
            </div>

            <div className={sharedStyles.formActions}>
                <button
                    type="button"
                    onClick={resetDefaults}
                    className={`${sharedStyles.formBtn} ${sharedStyles.danger}`}
                >
                    {t("resetDefaults")}
                </button>
                <button
                    type="button"
                    onClick={saveChanges}
                    disabled={!hasUpdatedKeybinds}
                    className={`${sharedStyles.formBtn}`}
                >
                    <Save size={18} />
                    {t("save")}
                </button>
            </div>
        </div>
    );
};

export default KeybindsSettings;
