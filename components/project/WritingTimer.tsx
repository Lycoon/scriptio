"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Timer } from "lucide-react";
import { join } from "@src/lib/utils/misc";

import styles from "./WritingTimer.module.css";

type TimerMode = "countdown" | "stopwatch";

const PRESETS = [10, 15, 25, 45];
// Minutes added/removed per stepper click, and the allowed duration range (sec).
const STEP = 5;
const MIN_SECONDS = 1;
const MAX_SECONDS = 180 * 60;

const clampSeconds = (sec: number) => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(sec)));

/** Parse a manually typed duration: "M", "M:SS", or "H:MM:SS". Returns total
 *  seconds, or null if unparseable. A bare number is read as minutes. */
const parseClock = (raw: string): number | null => {
    const s = raw.trim();
    if (!s) return null;
    const parts = s.split(":");
    if (parts.length > 3) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (nums.length === 1) return nums[0] * 60;
    if (nums.length === 2) return nums[0] * 60 + nums[1];
    return nums[0] * 3600 + nums[1] * 60 + nums[2];
};

/** Gentle two-note chime when a countdown completes. Synthesised so no audio
 *  asset is needed; failures (autoplay policy, no WebAudio) are ignored. */
const playChime = () => {
    try {
        const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const now = ctx.currentTime;
        [880, 1175].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            const t0 = now + i * 0.18;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.4);
        });
        setTimeout(() => ctx.close().catch(() => {}), 1000);
    } catch {
        // Audio is a nice-to-have; ignore failures.
    }
};

const formatClock = (ms: number, roundUp: boolean): string => {
    const totalSec = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

interface WritingTimerProps {
    /** Shared footer action-button classes, so the trigger matches the others. */
    triggerClassName: string;
    triggerActiveClassName: string;
}

/**
 * Writing-session timer: a footer icon that opens a popover to run either a
 * countdown (set a duration, get a chime at zero) or a count-up stopwatch.
 * Timer state is local and ephemeral — it lives as long as the footer is
 * mounted but is not persisted across reloads.
 */
const WritingTimer = ({ triggerClassName, triggerActiveClassName }: WritingTimerProps) => {
    const t = useTranslations("timer");

    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<TimerMode>("countdown");
    const [durationSec, setDurationSec] = useState(25 * 60);
    const [running, setRunning] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [completed, setCompleted] = useState(false);
    // Manual editing of the countdown duration via the display field.
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState("");

    const anchorRef = useRef<HTMLDivElement>(null);
    // Timestamp such that elapsed = Date.now() - startTsRef while running.
    const startTsRef = useRef(0);

    const targetMs = durationSec * 1000;
    const isIdle = !running && elapsedMs === 0 && !completed;
    const isActive = running || elapsedMs > 0;
    // Duration is only adjustable before a countdown starts.
    const canSetDuration = mode === "countdown" && isIdle;
    const displayMs = mode === "countdown" ? Math.max(0, targetMs - elapsedMs) : elapsedMs;
    const clock = formatClock(displayMs, mode === "countdown");

    // Tick while running.
    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 250);
        return () => clearInterval(id);
    }, [running]);

    // Countdown completion.
    useEffect(() => {
        if (mode === "countdown" && running && elapsedMs >= targetMs) {
            setRunning(false);
            setElapsedMs(targetMs);
            setCompleted(true);
            playChime();
        }
    }, [mode, running, elapsedMs, targetMs]);

    // Close the popover on outside click.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
                setOpen(false);
                setEditing(false);
            }
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    const start = () => {
        setEditing(false);
        setCompleted(false);
        startTsRef.current = Date.now() - elapsedMs;
        setRunning(true);
    };
    const pause = () => setRunning(false);
    const reset = () => {
        setEditing(false);
        setRunning(false);
        setElapsedMs(0);
        setCompleted(false);
    };
    const adjustDuration = (deltaMin: number) =>
        setDurationSec((s) => clampSeconds(s + deltaMin * 60));

    const selectMode = (next: TimerMode) => {
        if (next === mode) return;
        reset();
        setMode(next);
    };

    const toggleOpen = () => {
        setOpen((o) => !o);
        setEditing(false);
    };

    const startEdit = () => {
        setEditValue(formatClock(durationSec * 1000, false));
        setEditing(true);
    };
    const commitEdit = () => {
        const parsed = parseClock(editValue);
        if (parsed !== null) setDurationSec(clampSeconds(parsed));
        setEditing(false);
    };

    return (
        <div className={styles.anchor} ref={anchorRef}>
            <button
                type="button"
                className={join(triggerClassName, open || isActive ? triggerActiveClassName : "")}
                onClick={toggleOpen}
                title={t("title")}
                aria-label={t("title")}
            >
                <Timer size={14} />
            </button>

            {isActive && <span className={join(styles.time, completed ? styles.time_done : "")}>{clock}</span>}

            {open && (
                <div className={styles.panel}>
                    <span className={styles.title}>{t("title")}</span>

                    <div className={styles.tabs}>
                        <button
                            type="button"
                            className={join(styles.tab, mode === "countdown" ? styles.tab_active : "")}
                            onClick={() => selectMode("countdown")}
                            disabled={isActive}
                        >
                            {t("countdown")}
                        </button>
                        <button
                            type="button"
                            className={join(styles.tab, mode === "stopwatch" ? styles.tab_active : "")}
                            onClick={() => selectMode("stopwatch")}
                            disabled={isActive}
                        >
                            {t("stopwatch")}
                        </button>
                    </div>

                    <div className={styles.stepper_group}>
                        {canSetDuration && (
                            <button
                                type="button"
                                className={styles.stepper}
                                onClick={() => adjustDuration(STEP)}
                                aria-label={`+${STEP} ${t("minutesShort")}`}
                            >
                                <ChevronUp size={16} />
                            </button>
                        )}
                        {editing ? (
                            <input
                                className={styles.display_input}
                                value={editValue}
                                autoFocus
                                inputMode="numeric"
                                onChange={(e) => setEditValue(e.target.value)}
                                onFocus={(e) => e.currentTarget.select()}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitEdit();
                                    else if (e.key === "Escape") setEditing(false);
                                }}
                            />
                        ) : (
                            <div
                                className={join(
                                    styles.display,
                                    canSetDuration ? styles.display_editable : "",
                                    completed ? styles.display_done : "",
                                )}
                                onClick={canSetDuration ? startEdit : undefined}
                            >
                                {clock}
                            </div>
                        )}
                        {canSetDuration && (
                            <button
                                type="button"
                                className={styles.stepper}
                                onClick={() => adjustDuration(-STEP)}
                                aria-label={`-${STEP} ${t("minutesShort")}`}
                            >
                                <ChevronDown size={16} />
                            </button>
                        )}
                    </div>

                    {canSetDuration && (
                        <div className={styles.presets}>
                            {PRESETS.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    className={join(styles.chip, durationSec === m * 60 ? styles.chip_active : "")}
                                    onClick={() => setDurationSec(m * 60)}
                                >
                                    {m} {t("minutesShort")}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={styles.controls}>
                        {running ? (
                            <button type="button" className={styles.btn} onClick={pause}>
                                {t("pause")}
                            </button>
                        ) : isActive && !completed ? (
                            <button type="button" className={join(styles.btn, styles.btn_primary)} onClick={start}>
                                {t("resume")}
                            </button>
                        ) : !completed ? (
                            <button type="button" className={join(styles.btn, styles.btn_primary)} onClick={start}>
                                {t("start")}
                            </button>
                        ) : null}
                        {isActive && (
                            <button type="button" className={styles.btn} onClick={reset}>
                                {t("reset")}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WritingTimer;
