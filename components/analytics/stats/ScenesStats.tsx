"use client";

import { useContext, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { Doughnut, Bar } from "react-chartjs-2";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
} from "chart.js";

import styles from "../AnalyticsModal.module.css";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = {
    int:       "#6c8ebf",
    ext:       "#82b366",
    intExt:    "#d6a94a",
    unknown:   "#9e9e9e",
    day:       "#f5c842",
    night:     "#3b4d7a",
    dusk:      "#d4845a",
    dawn:      "#a78bbc",
    other:     "#9e9e9e",
    barFill:   "rgba(108, 142, 191, 0.75)",
    barBorder: "rgba(108, 142, 191, 1)",
};

const CHART_TEXT_COLOR = "rgba(180, 180, 180, 0.9)";

const doughnutDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: "bottom" as const,
            labels: { color: CHART_TEXT_COLOR, boxWidth: 14, padding: 14, font: { size: 12 } },
        },
        tooltip: { enabled: true },
    },
};

const barDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
    },
    scales: {
        x: {
            ticks: { color: CHART_TEXT_COLOR, font: { size: 11 } },
            grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
            beginAtZero: true,
            ticks: { color: CHART_TEXT_COLOR, precision: 0, font: { size: 11 } },
            grid: { color: "rgba(255,255,255,0.06)" },
        },
    },
};

// ── Parsing helpers ────────────────────────────────────────────────────────────

type ParsedScene = { setting: "INT" | "EXT" | "INT./EXT." | "OTHER"; time: string };

const TIME_KEYWORDS = ["NIGHT", "DAY", "DUSK", "DAWN", "MORNING", "EVENING", "AFTERNOON", "SUNSET", "SUNRISE", "CONTINUOUS", "LATER", "MOMENTS LATER"];

function parseSceneTitle(title: string): ParsedScene {
    const upper = title.toUpperCase().trim();

    let setting: ParsedScene["setting"] = "OTHER";
    if (upper.startsWith("INT./EXT.") || upper.startsWith("EXT./INT.")) setting = "INT./EXT.";
    else if (upper.startsWith("INT."))  setting = "INT";
    else if (upper.startsWith("EXT."))  setting = "EXT";

    // Time is usually after the last " - "
    const dashIdx = upper.lastIndexOf(" - ");
    let time = "UNKNOWN";
    if (dashIdx !== -1) {
        const candidate = upper.slice(dashIdx + 3).trim();
        const matched = TIME_KEYWORDS.find((k) => candidate.startsWith(k));
        time = matched ?? candidate.split(" ")[0] ?? "UNKNOWN";
    }

    return { setting, time };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScenesStats() {
    const { scenes } = useContext(ProjectContext);

    const stats = useMemo(() => {
        const settingCount: Record<string, number> = { INT: 0, EXT: 0, "INT./EXT.": 0, OTHER: 0 };
        const timeCount: Record<string, number> = {};
        const lengths: number[] = [];

        for (const scene of scenes) {
            const { setting, time } = parseSceneTitle(scene.title);
            settingCount[setting] = (settingCount[setting] ?? 0) + 1;
            timeCount[time] = (timeCount[time] ?? 0) + 1;
            lengths.push(scene.nextPosition - scene.position);
        }

        // Bucket scene lengths
        const buckets = [
            { label: "1–3",   min: 1,   max: 3   },
            { label: "4–6",   min: 4,   max: 6   },
            { label: "7–10",  min: 7,   max: 10  },
            { label: "11–15", min: 11,  max: 15  },
            { label: "16–25", min: 16,  max: 25  },
            { label: "26+",   min: 26,  max: Infinity },
        ];
        const lengthBuckets = buckets.map((b) => ({
            label: b.label,
            count: lengths.filter((l) => l >= b.min && l <= b.max).length,
        }));

        // Top time entries (limit to 6 for readability)
        const topTimes: [string, number][] = Object.entries(timeCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        return { settingCount, topTimes, lengthBuckets, total: scenes.length };
    }, [scenes]);

    if (stats.total === 0) {
        return <p className={styles.empty}>No scenes found. Start writing your screenplay.</p>;
    }

    const settingData = {
        labels: ["INT", "EXT", "INT./EXT.", "Other"],
        datasets: [{
            data: [
                stats.settingCount.INT,
                stats.settingCount.EXT,
                stats.settingCount["INT./EXT."],
                stats.settingCount.OTHER,
            ],
            backgroundColor: [PALETTE.int, PALETTE.ext, PALETTE.intExt, PALETTE.unknown],
            borderWidth: 0,
        }],
    };

    // ── Time-of-day doughnut ─────────────────────────────────────────────────────

    const timeColors = [PALETTE.day, PALETTE.night, PALETTE.dusk, PALETTE.dawn, PALETTE.other, "rgba(120,120,180,0.8)"];
    const timeData = {
        labels: stats.topTimes.map(([label]: [string, number]) => label),
        datasets: [{
            data: stats.topTimes.map(([, count]: [string, number]) => count),
            backgroundColor: stats.topTimes.map((_: [string, number], i: number) => timeColors[i % timeColors.length]),
            borderWidth: 0,
        }],
    };

    // ── Length distribution bar chart ─────────────────────────────────────────────

    const lengthData = {
        labels: stats.lengthBuckets.map((b: { label: string; count: number }) => b.label),
        datasets: [{
            label: "Scenes",
            data: stats.lengthBuckets.map((b: { label: string; count: number }) => b.count),
            backgroundColor: PALETTE.barFill,
            borderColor: PALETTE.barBorder,
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    return (
        <div className={styles.statsGrid}>
            {/* Total scenes */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Total Scenes</span>
                <span className={styles.cardValue}>{stats.total}</span>
            </div>

            {/* INT dominance */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Interior Scenes</span>
                <span className={styles.cardValue}>
                    {stats.total > 0 ? Math.round((stats.settingCount.INT / stats.total) * 100) : 0}
                    <span style={{ fontSize: "1.2rem", opacity: 0.6 }}>%</span>
                </span>
            </div>

            {/* Setting distribution */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Setting Distribution</span>
                <div className={styles.cardChart}>
                    <Doughnut data={settingData} options={doughnutDefaults} />
                </div>
            </div>

            {/* Time of day */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Time of Day</span>
                <div className={styles.cardChart}>
                    <Doughnut data={timeData} options={doughnutDefaults} />
                </div>
            </div>

            {/* Scene length distribution */}
            <div className={styles.cardFull}>
                <span className={styles.cardTitle}>Scene Length Distribution (nodes)</span>
                <div className={styles.cardChartTall}>
                    <Bar data={lengthData} options={barDefaults} />
                </div>
            </div>
        </div>
    );
}
