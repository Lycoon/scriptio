"use client";

import { useEffect, useRef, useState } from "react";

import form from "./../../utils/Form.module.css";
import sharedStyles from "./../project/ProjectSettings.module.css";
import styles from "./KeybindsSettings.module.css";

import { useSettings } from "@src/lib/utils/hooks";
import { tinykeys } from "@node_modules/tinykeys/dist/tinykeys";
import { editUserSettings } from "@src/lib/utils/requests";
import { DEFAULT_KEYBINDS, DefaultKeyBind, prettyPrintKeybind, UserKeybindsMap } from "@src/lib/utils/keybinds";

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

    return (
        <div key={id} className={styles.optionCard}>
            <div className={styles.optionInfo}>
                <span className={styles.optionTitle}>{kb.label}</span>
                <span className={styles.optionDesc}>{`Default: ${prettyPrintKeybind(kb.defaultCombo)}`}</span>
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
                        <span className={styles.keyText}>Type… (Esc to cancel)</span>
                    ) : tempCombo && isListening ? (
                        <span className={styles.keyText}>{prettyPrintKeybind(tempCombo)}</span>
                    ) : effective ? (
                        <span className={styles.keyText}>{prettyPrintKeybind(effective)}</span>
                    ) : (
                        <span className={styles.keyText}>Not set</span>
                    )}
                </div>

                <div className={styles.keyAreaActions}>
                    <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={() => resetBinding(id)}
                        title="Clear user binding"
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
};

const KeybindsSettings = () => {
    const { settings, updateSetting } = useSettings() as {
        settings?: { keybinds?: UserKeybindsMap };
        updateSetting?: (key: string, value: any) => Promise<void>;
    };

    const [userKeybinds, setUserKeybinds] = useState<UserKeybindsMap>({});
    const [listeningFor, setListeningFor] = useState<string | null>(null);
    const [tempCombo, setTempCombo] = useState<string | null>(null);
    const [hasUpdatedKeybinds, setHasUpdatedKeybinds] = useState(false);
    const tinykeysStopRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (settings && settings.keybinds) {
            setUserKeybinds(settings.keybinds);
        } else {
            setUserKeybinds({});
        }
    }, [settings]);

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
                setTempCombo("Modifiers only — press a regular key");
                return;
            }
            setTempCombo(combo);
            setHasUpdatedKeybinds(true);

            setUserKeybinds((prev) => {
                const next = { ...prev, [listeningFor]: combo };
                if (updateSetting) {
                    updateSetting("keybinds", next).catch((err) => {
                        console.error("Failed to save keybinds", err);
                    });
                }
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
    }, [listeningFor, updateSetting]);

    const startListening = (id: string) => {
        setListeningFor(id);
        setTempCombo(null);
    };

    const resetBinding = (id: string) => {
        setUserKeybinds((prev) => {
            const next = { ...prev };
            if (next[id]) setHasUpdatedKeybinds(true);

            delete next[id];
            if (updateSetting) updateSetting("keybinds", next).catch((err) => console.error(err));
            return next;
        });
    };

    const resetDefaults = () => {
        setUserKeybinds({});
        setHasUpdatedKeybinds(true);
        if (updateSetting) updateSetting("keybinds", {}).catch((err) => console.error(err));
    };

    const saveChanges = () => {
        setHasUpdatedKeybinds(false);
        editUserSettings({ keybinds: userKeybinds });
    };

    return (
        <div className={sharedStyles.settingsForm}>
            <div className={sharedStyles.formGroup}>
                <label className={form.label}>Screenplay Elements</label>
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
                    Reset to defaults
                </button>
                <button
                    type="button"
                    onClick={saveChanges}
                    disabled={!hasUpdatedKeybinds}
                    className={`${sharedStyles.formBtn}`}
                >
                    Save changes
                </button>
            </div>
        </div>
    );
};

export default KeybindsSettings;
