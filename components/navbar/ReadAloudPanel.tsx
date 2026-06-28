"use client";

import { useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, Mars, Pause, Play, Settings, Square, Venus, VenusAndMars, Volume2, X } from "lucide-react";

import { ProjectContext } from "@src/context/ProjectContext";
import { DashboardContext } from "@src/context/DashboardContext";
import { useReadAloud } from "@src/context/ReadAloudContext";
import { CharacterGender, getCharacterNames } from "@src/lib/screenplay/characters";
import { getVoiceInfo, voiceAccent, voiceLabel } from "@src/lib/tts/voice-catalog";
import Dropdown, { DropdownOption } from "@components/utils/Dropdown";
import Switch from "@components/utils/Switch";

import styles from "./ReadAloudPanel.module.css";

interface ReadAloudPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const ReadAloudPanel = ({ isOpen, onClose }: ReadAloudPanelProps) => {
    const t = useTranslations("readaloud");
    const { screenplay, editor, isReadOnly } = useContext(ProjectContext);
    const { openDashboard } = useContext(DashboardContext);
    const {
        modelInstalled,
        availableVoices,
        characterVoices,
        setCharacterVoice,
        excludedCharacters,
        setCharacterEnabled,
        setAllCharactersEnabled,
        narratorVoiceId,
        setNarratorVoiceId,
        playbackState,
        currentLine,
        volume,
        setVolume,
        narrationOptions,
        setNarrationOption,
        play,
        pause,
        resume,
        stop,
    } = useReadAloud();

    const panelRef = useRef<HTMLDivElement>(null);

    // Click outside to close (playback keeps running in the background).
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Element;
            // Keep the panel open when interacting with a voice dropdown menu,
            // which is rendered in a body portal outside the panel.
            if (target.closest?.("[data-dropdown-portal]")) return;
            if (panelRef.current && !panelRef.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onClose]);

    const characterNames = useMemo(() => getCharacterNames(screenplay), [screenplay]);

    const allCharactersEnabled =
        characterNames.length > 0 && characterNames.every((name) => !excludedCharacters.has(name.toUpperCase()));

    // Voices are grouped by accent: the menu shows "American"/"British" and the
    // voices for each reveal in a hover submenu.
    const voiceOptions: DropdownOption[] = useMemo(() => {
        const toOption = (id: string): DropdownOption => {
            const v = getVoiceInfo(id);
            if (!v) return { value: id, label: voiceLabel(id) };
            const GenderIcon =
                v.gender === CharacterGender.MALE ? Mars : v.gender === CharacterGender.FEMALE ? Venus : VenusAndMars;
            const genderColor =
                v.gender === CharacterGender.MALE
                    ? "#60a5fa"
                    : v.gender === CharacterGender.FEMALE
                      ? "#f472b6"
                      : "var(--secondary-text)";
            return {
                value: id,
                label: (
                    <span className={styles.voice_option}>
                        <span className={styles.voice_flag}>{v.flag}</span>
                        {v.name}
                        <GenderIcon size={12} color={genderColor} className={styles.voice_gender} />
                    </span>
                ),
            };
        };
        const accents: { key: "american" | "british"; flag: string; label: string }[] = [
            { key: "american", flag: "🇺🇸", label: t("accentAmerican") },
            { key: "british", flag: "🇬🇧", label: t("accentBritish") },
        ];
        return accents
            .map(({ key, flag, label }) => {
                const children = availableVoices.filter((id) => voiceAccent(id) === key).map(toOption);
                return {
                    value: `__accent_${key}`,
                    label: (
                        <span className={styles.voice_option}>
                            <span className={styles.voice_flag}>{flag}</span>
                            {label}
                        </span>
                    ),
                    children,
                };
            })
            .filter((group) => group.children.length > 0);
    }, [availableVoices, t]);

    if (!isOpen) return null;

    const hasVoices = modelInstalled && availableVoices.length > 0;
    const isPreparing = playbackState === "preparing";
    const isPlaying = playbackState === "playing";
    const isPaused = playbackState === "paused";
    const isActive = isPreparing || isPlaying || isPaused;
    const defaultVoice = narratorVoiceId ?? availableVoices[0] ?? "";

    const openSettings = () => {
        onClose();
        openDashboard("Language");
    };

    const handlePlayPause = () => {
        if (isPlaying) pause();
        else if (isPaused) resume();
        else if (editor) play(editor);
    };

    return (
        <div className={styles.container} ref={panelRef}>
            <div className={styles.header}>
                <span className={styles.title}>{t("title")}</span>
                <div className={styles.header_actions}>
                    <button className={styles.icon_btn} onClick={openSettings} aria-label={t("manageVoices")} title={t("manageVoices")}>
                        <Settings size={16} />
                    </button>
                    <button className={styles.icon_btn} onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!hasVoices ? (
                <div className={styles.empty}>
                    <p className={styles.empty_text}>{t("emptyState")}</p>
                    <button className={styles.empty_btn} onClick={openSettings}>
                        <Download size={14} />
                        {t("downloadVoice")}
                    </button>
                </div>
            ) : (
                <>
                    {/* Transport */}
                    <div className={styles.section}>
                        <div className={styles.transport}>
                            <button
                                className={styles.play_btn}
                                onClick={handlePlayPause}
                                disabled={isReadOnly || characterNames.length === 0}
                                aria-label={isPlaying ? t("pause") : t("play")}
                            >
                                {isPlaying ? (
                                    <Pause size={18} color="var(--secondary)" fill="var(--secondary)" />
                                ) : (
                                    <Play size={18} color="var(--secondary)" fill="var(--secondary)" />
                                )}
                            </button>
                            <button
                                className={styles.stop_btn}
                                onClick={stop}
                                disabled={!isActive}
                                aria-label={t("stop")}
                            >
                                <Square size={14} color="var(--secondary-text)" fill="var(--secondary-text)" />
                            </button>
                            <div className={styles.transport_status}>
                                {isPreparing ? (
                                    <span className={styles.status_text}>
                                        <Loader2 size={13} className={styles.spinner} />
                                        {t("preparing")}
                                    </span>
                                ) : currentLine && (isPlaying || isPaused) ? (
                                    <span className={styles.now_line}>
                                        {currentLine.character && (
                                            <span className={styles.now_char}>{currentLine.character}: </span>
                                        )}
                                        {currentLine.text}
                                    </span>
                                ) : (
                                    <span className={styles.status_text}>{t("ready")}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Volume */}
                    <div className={styles.section}>
                        <div className={styles.volume_row}>
                            <Volume2 size={16} color="var(--secondary-text)" />
                            <input
                                type="range"
                                className={styles.volume_slider}
                                min={0}
                                max={1}
                                step={0.05}
                                value={volume}
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                aria-label={t("volume")}
                            />
                        </div>
                    </div>

                    {/* Read */}
                    <div className={styles.section}>
                        <span className={styles.section_label}>{t("read")}</span>
                        <div className={styles.options_list}>
                            {(
                                [
                                    ["action", t("readAction")],
                                    ["scene", t("readScene")],
                                    ["transition", t("readTransition")],
                                    ["parenthetical", t("readParenthetical")],
                                ] as const
                            ).map(([key, label]) => (
                                <div key={key} className={styles.row}>
                                    <div className={styles.row_main}>
                                        <span className={styles.row_label}>{label}</span>
                                    </div>
                                    <Switch
                                        checked={narrationOptions[key]}
                                        onChange={(v) => setNarrationOption(key, v)}
                                        disabled={isActive}
                                        ariaLabel={label}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Voice assignment */}
                    <div className={styles.section}>
                        <div className={styles.section_header}>
                            <span className={styles.section_label}>{t("voices")}</span>
                            {characterNames.length > 0 && (
                                <button
                                    className={styles.select_all_btn}
                                    onClick={() => setAllCharactersEnabled(characterNames, !allCharactersEnabled)}
                                >
                                    {allCharactersEnabled ? t("deselectAll") : t("selectAll")}
                                </button>
                            )}
                        </div>
                        <div className={styles.character_list}>
                            <div className={styles.character_row}>
                                {/* The narrator always reads (narration + unassigned lines),
                                    so its checkbox is shown checked but disabled. */}
                                <input
                                    type="checkbox"
                                    className={styles.character_check}
                                    checked
                                    disabled
                                    readOnly
                                    aria-label={t("narrator")}
                                    title={t("narrator")}
                                />
                                <span className={styles.character_name}>{t("narrator")}</span>
                                <div className={styles.character_field}>
                                    <Dropdown
                                        value={defaultVoice}
                                        onChange={setNarratorVoiceId}
                                        options={voiceOptions}
                                        className={styles.assign_field}
                                        fitContent
                                        portal
                                    />
                                </div>
                            </div>

                            {characterNames.map((name) => {
                                const enabled = !excludedCharacters.has(name.toUpperCase());
                                return (
                                    <div key={name} className={styles.character_row}>
                                        <input
                                            type="checkbox"
                                            className={styles.character_check}
                                            checked={enabled}
                                            onChange={(e) => setCharacterEnabled(name, e.target.checked)}
                                            aria-label={t("readCharacter", { name })}
                                            title={t("readCharacter", { name })}
                                        />
                                        <span
                                            className={`${styles.character_name} ${enabled ? "" : styles.character_muted}`}
                                            title={name}
                                        >
                                            {name}
                                        </span>
                                        <div className={styles.character_field}>
                                            <Dropdown
                                                value={characterVoices[name] ?? defaultVoice}
                                                onChange={(v) => setCharacterVoice(name, v)}
                                                options={voiceOptions}
                                                className={styles.assign_field}
                                                fitContent
                                                portal
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ReadAloudPanel;
