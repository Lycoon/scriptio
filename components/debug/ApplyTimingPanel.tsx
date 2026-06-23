"use client";

import { useEffect, useRef, useState } from "react";

import {
    ApplyStat,
    getApplyTimingRevision,
    getApplyTimingStats,
    recordTiming,
    resetApplyTimingStats,
} from "@src/lib/screenplay/extensions/apply-timing";

/**
 * On-screen overlay that surfaces the per-extension `apply` timing stats
 * collected in apply-timing.ts, so the editor's hot-path cost can be watched
 * without opening devtools (whose console logging itself adds lag).
 *
 * Toggle with Ctrl+Alt+P. Hidden by default; visibility is persisted in
 * localStorage. The whole component is compiled out of production builds.
 */

const ENABLED = process.env.NODE_ENV !== "production";
const STORAGE_KEY = "scriptio.applyTimingPanel.visible";
const POLL_INTERVAL_MS = 400;

// Name of the synthetic row holding the whole-keydown duration. Pinned at the
// top of the panel, separate from the per-extension apply rows.
const KEYDOWN_ROW = "keydown (total)";

// Modifier/navigation keys that don't edit — skipped so they don't dilute the
// keydown stats with ~0ms samples.
const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"]);

interface Row extends ApplyStat {
    name: string;
    avg: number;
}

const fmt = (ms: number): string => (ms === Infinity ? "—" : ms.toFixed(2));

// Colour the slow rows so regressions jump out: green < 1ms, amber < 4ms, red beyond.
const heatColor = (ms: number): string => {
    if (ms >= 4) return "#ff6b6b";
    if (ms >= 1) return "#ffd166";
    return "#8ce99a";
};

const ApplyTimingPanel = () => {
    const [visible, setVisible] = useState(false);
    const [rows, setRows] = useState<Row[]>([]);
    const lastRevision = useRef(-1);

    // Restore persisted visibility once mounted (client only).
    useEffect(() => {
        if (!ENABLED) return;
        setVisible(localStorage.getItem(STORAGE_KEY) === "1");
    }, []);

    // Measure the WHOLE keydown step — handlers + ProseMirror dispatch + view
    // update + the forced reflow it triggers inline — which the per-extension
    // `apply` times don't cover. A capture-phase listener runs first and stamps
    // t0; a queueMicrotask fires once the entire synchronous keydown task has
    // unwound (the inline forced reflow happens during it, so it's included),
    // before paint. Installed on mount so samples accrue even before the panel
    // is opened. Robust against handlers that stopPropagation.
    useEffect(() => {
        if (!ENABLED) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (IGNORED_KEYS.has(e.key)) return;
            const t0 = performance.now();
            queueMicrotask(() => recordTiming(KEYDOWN_ROW, performance.now() - t0));
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
    }, []);

    // Ctrl+Alt+P toggles the panel.
    useEffect(() => {
        if (!ENABLED) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.altKey && (e.key === "p" || e.key === "P")) {
                e.preventDefault();
                setVisible((v) => {
                    const next = !v;
                    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
                    return next;
                });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Poll the stats map on an interval rather than re-rendering on every
    // keystroke — decoupling the panel's render cost from the edit hot path,
    // which is the whole point of not using the console.
    useEffect(() => {
        if (!ENABLED || !visible) return;

        const tick = () => {
            const revision = getApplyTimingRevision();
            if (revision === lastRevision.current) return;
            lastRevision.current = revision;

            const next: Row[] = [];
            for (const [name, stat] of getApplyTimingStats()) {
                next.push({
                    name,
                    ...stat,
                    avg: stat.count > 0 ? stat.sum / stat.count : 0,
                });
            }
            next.sort((a, b) => b.avg - a.avg);
            setRows(next);
        };

        tick();
        const id = window.setInterval(tick, POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [visible]);

    if (!ENABLED || !visible) return null;

    const reset = () => {
        resetApplyTimingStats();
        lastRevision.current = -1;
        setRows([]);
    };

    // Pin the whole-keydown row above the per-extension apply rows.
    const keydownRow = rows.find((r) => r.name === KEYDOWN_ROW);
    const applyRows = rows.filter((r) => r.name !== KEYDOWN_ROW);

    const renderRow = (r: Row, opts?: { bold?: boolean }) => (
        <tr key={r.name} style={opts?.bold ? { fontWeight: 600 } : undefined}>
            <td style={tdLeft}>{r.name}</td>
            <td style={{ ...tdRight, color: heatColor(r.last) }}>{fmt(r.last)}</td>
            <td style={tdRight}>{fmt(r.min)}</td>
            <td style={{ ...tdRight, color: heatColor(r.avg) }}>{fmt(r.avg)}</td>
            <td style={{ ...tdRight, color: heatColor(r.max) }}>{fmt(r.max)}</td>
            <td style={tdRight}>{r.count}</td>
        </tr>
    );

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <span style={{ fontWeight: 600 }}>apply timing (ms)</span>
                <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnStyle} onClick={reset} title="Clear stats">
                        reset
                    </button>
                    <button
                        style={btnStyle}
                        onClick={() => {
                            localStorage.setItem(STORAGE_KEY, "0");
                            setVisible(false);
                        }}
                        title="Hide (Ctrl+Alt+P)"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <table style={tableStyle}>
                <thead>
                    <tr style={{ color: "#9aa0a6" }}>
                        <th style={thLeft}>extension</th>
                        <th style={thRight}>last</th>
                        <th style={thRight}>min</th>
                        <th style={thRight}>avg</th>
                        <th style={thRight}>max</th>
                        <th style={thRight}>n</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={6} style={{ ...tdRight, textAlign: "center", color: "#9aa0a6" }}>
                                type to collect samples…
                            </td>
                        </tr>
                    ) : (
                        <>
                            {keydownRow && renderRow(keydownRow, { bold: true })}
                            {keydownRow && applyRows.length > 0 && (
                                <tr>
                                    <td colSpan={6} style={{ borderTop: "1px solid rgba(255,255,255,0.12)", height: 4 }} />
                                </tr>
                            )}
                            {applyRows.map((r) => renderRow(r))}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
};

const panelStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 12,
    right: 12,
    zIndex: 99999,
    width: 340,
    padding: "8px 10px",
    background: "rgba(20, 22, 26, 0.92)",
    color: "#e8eaed",
    font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    backdropFilter: "blur(4px)",
    userSelect: "none",
    pointerEvents: "auto",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
};

const btnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.08)",
    color: "#e8eaed",
    border: "none",
    borderRadius: 4,
    padding: "2px 6px",
    cursor: "pointer",
    font: "inherit",
};

const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
};

const thLeft: React.CSSProperties = { textAlign: "left", fontWeight: 400, paddingBottom: 2 };
const thRight: React.CSSProperties = { textAlign: "right", fontWeight: 400, paddingBottom: 2 };
const tdLeft: React.CSSProperties = { textAlign: "left", paddingTop: 1 };
const tdRight: React.CSSProperties = { textAlign: "right", paddingTop: 1, fontVariantNumeric: "tabular-nums" };

export default ApplyTimingPanel;
