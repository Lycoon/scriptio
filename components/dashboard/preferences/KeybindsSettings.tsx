"use client";

import { useEffect, useRef, useState } from "react";

import sharedStyles from "./../project/ProjectSettings.module.css";
import styles from "./KeybindsSettings.module.css";

import { useSettings } from "@src/lib/utils/hooks";
import { tinykeys } from "@node_modules/tinykeys/dist/tinykeys";
import {
    DEFAULT_KEYBINDS,
    DefaultKeyBind,
    KeybindGroup,
    KeybindId,
    prettyPrintKeybind,
    UserKeybindsMap,
} from "@src/lib/utils/keybinds";
import { useTranslations } from "next-intl";
import { RotateCcw, Save } from "lucide-react";
import Section from "@components/dashboard/SettingsSection";

/** Section order in the panel: what works everywhere, then the two editor sets. */
const GROUP_ORDER: KeybindGroup[] = ["global", "view", "screenplay", "style"];

const GROUPED_KEYBINDS = GROUP_ORDER.map((group) => ({
    group,
    binds: (Object.entries(DEFAULT_KEYBINDS) as [KeybindId, DefaultKeyBind][]).filter(
        ([, kb]) => kb.group === group,
    ),
}));

export type KeybindElementProps = {
    id: KeybindId;
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
                <span className={styles.optionTitle}>{t(`labels.${id}`)}</span>
                <span className={styles.optionDesc}>{t("defaultPrefix", { combo: prettyPrintKeybind(kb.defaultCombo) })}</span>
            </div>

            <div className={styles.keyAreaWrap}>
                <div
                    role="button"
                    tabIndex={0}
                    className={styles.keyArea}
                    data-listening={isListening}
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
                        <RotateCcw size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const KeybindsSettings = () => {
    const { settings, saveSettings } = useSettings();

    const t = useTranslations("keybinds");
    const tCommon = useTranslations("common");
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

        // Capitalised, because a global combo is resolved through
        // `event.getModifierState(name)` and the DOM only recognises these exact
        // names — a lowercase "alt" matches nothing, silently.
        const hasMod = e.ctrlKey || e.metaKey;
        if (hasMod) parts.push("$mod");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");

        const lower = (e.key || "").toLowerCase();
        if (["shift", "ctrl", "control", "meta", "alt"].includes(lower)) return null;

        // Record the key the user pressed, not the character it produced. With
        // Alt or Shift down those differ — Option+F is "ƒ", Shift+1 is "!" — and
        // a combo stored as the character is one the handlers cannot match back
        // (see `physicalKey`). Everything else keeps its DOM name, in the casing
        // ProseMirror expects: "Enter", "ArrowLeft", "F5".
        const main = /^(Key[A-Z]|Digit[0-9]|Space)$/.test(e.code) ? e.code : e.key.length === 1 ? lower : e.key;

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
                // Stop the dashboard's window-level Escape handler from also firing
                // and closing the modal — Escape during capture only cancels listening.
                e.stopImmediatePropagation();
                setListeningFor(null);
                setTempCombo(null);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keydown", onCancel, { capture: true });
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keydown", onCancel, { capture: true });
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
            {GROUPED_KEYBINDS.map(({ group, binds }) => (
                <Section key={group} title={t(`groups.${group}`)}>
                    <div className={styles.options}>
                        {binds.map(([id, kb]) => (
                            <KeybindElement
                                key={id}
                                id={id}
                                kb={kb}
                                resetBinding={resetBinding}
                                tempCombo={tempCombo}
                                current={userKeybinds[id]}
                                isListening={listeningFor === id}
                                startListening={startListening}
                            />
                        ))}
                    </div>
                </Section>
            ))}

            <div className={sharedStyles.formActions}>
                <button className={sharedStyles.formBtn} onClick={resetDefaults}>
                    <RotateCcw size={18} />
                    {tCommon("resetDefaults")}
                </button>
                <button className={sharedStyles.formBtn} disabled={!hasUpdatedKeybinds} onClick={saveChanges}>
                    <Save size={18} />
                    {tCommon("save")}
                </button>
            </div>
        </div>
    );
};

export default KeybindsSettings;
