"use client";

import { useContext, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { Bar, Doughnut } from "react-chartjs-2";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
} from "chart.js";

import styles from "../AnalyticsModal.module.css";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

// ── Colour palette ────────────────────────────────────────────────────────────

const PALETTE = {
    int:       "#6c8ebf",
    ext:       "#82b366",
    intExt:    "#d6a94a",
    unknown:   "#9e9e9e",
};

const CHART_TEXT_COLOR = "rgba(180, 180, 180, 0.9)";

const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: { legend: { display: false } },
    scales: {
        x: {
            beginAtZero: true,
            ticks: { color: CHART_TEXT_COLOR, precision: 0, font: { size: 11 } },
            grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
            ticks: { color: CHART_TEXT_COLOR, font: { size: 11 } },
            grid: { display: false },
        },
    },
};

const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: "bottom" as const,
            labels: { color: CHART_TEXT_COLOR, boxWidth: 14, padding: 14, font: { size: 12 } },
        },
    },
};

// ── Parsing helpers ────────────────────────────────────────────────────────────

type Setting = "INT" | "EXT" | "INT./EXT." | "OTHER";

interface ParsedSceneLoc {
    setting: Setting;
    location: string;
}

function parseSceneForLocation(title: string): ParsedSceneLoc {
    const upper = title.toUpperCase().trim();

    let setting: Setting = "OTHER";
    let rest = upper;

    if (upper.startsWith("INT./EXT.") || upper.startsWith("EXT./INT.")) {
        setting = "INT./EXT.";
        rest = upper.slice(upper.indexOf(".") + 1).replace(/^\/EXT\.|^\/INT\./, "").trim();
    } else if (upper.startsWith("INT.")) {
        setting = "INT";
        rest = upper.slice(4).trim();
    } else if (upper.startsWith("EXT.")) {
        setting = "EXT";
        rest = upper.slice(4).trim();
    }

    // Location is everything before the last " - TIME" part
    const dashIdx = rest.lastIndexOf(" - ");
    const location = dashIdx !== -1 ? rest.slice(0, dashIdx).trim() : rest.trim();

    return { setting, location: location || "UNKNOWN" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LocationsStats() {
    const { scenes } = useContext(ProjectContext);

    const stats = useMemo(() => {
        // Count scenes per location, and track setting per location
        const locationCount: Record<string, number> = {};
        const locationSettings: Record<string, Record<Setting, number>> = {};

        for (const scene of scenes) {
            const { setting, location } = parseSceneForLocation(scene.title);
            locationCount[location] = (locationCount[location] ?? 0) + 1;
            if (!locationSettings[location]) {
                locationSettings[location] = { INT: 0, EXT: 0, "INT./EXT.": 0, OTHER: 0 };
            }
            locationSettings[location][setting]++;
        }

        // Top 10 locations
        const topLocations = Object.entries(locationCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .filter(([name]) => name !== "UNKNOWN");

        // Overall INT / EXT / BOTH / OTHER aggregated
        const overallSettings: Record<Setting, number> = { INT: 0, EXT: 0, "INT./EXT.": 0, OTHER: 0 };
        for (const perLoc of Object.values(locationSettings)) {
            for (const [s, n] of Object.entries(perLoc) as [Setting, number][]) {
                overallSettings[s] += n;
            }
        }

        const totalUnique = topLocations.length; // distinct named locations in top 10
        const totalAll = Object.keys(locationCount).filter((k) => k !== "UNKNOWN").length;

        return { topLocations, overallSettings, totalAll };
    }, [scenes]);

    if (stats.totalAll === 0) {
        return <p className={styles.empty}>No locations found. Scene headings like "INT. OFFICE - DAY" will appear here.</p>;
    }

    // ── Bar chart — top locations ───────────────────────────────────────────────

    const barData = {
        labels: stats.topLocations.map(([name]) => name),
        datasets: [{
            label: "Scenes",
            data: stats.topLocations.map(([, count]) => count),
            backgroundColor: stats.topLocations.map((_, i) =>
                `hsla(${130 + i * 7}, 42%, 50%, 0.75)`
            ),
            borderColor: stats.topLocations.map((_, i) =>
                `hsla(${130 + i * 7}, 42%, 50%, 1)`
            ),
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    // ── Doughnut — INT vs EXT ───────────────────────────────────────────────────

    const settingData = {
        labels: ["INT", "EXT", "INT./EXT.", "Other"],
        datasets: [{
            data: [
                stats.overallSettings.INT,
                stats.overallSettings.EXT,
                stats.overallSettings["INT./EXT."],
                stats.overallSettings.OTHER,
            ],
            backgroundColor: [PALETTE.int, PALETTE.ext, PALETTE.intExt, PALETTE.unknown],
            borderWidth: 0,
        }],
    };

    return (
        <div className={styles.statsGrid}>
            {/* KPI */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Unique Locations</span>
                <span className={styles.cardValue}>{stats.totalAll}</span>
            </div>

            <div className={styles.card}>
                <span className={styles.cardTitle}>Most Used</span>
                <span className={styles.cardValue} style={{ fontSize: "1.4rem", wordBreak: "break-word" }}>
                    {stats.topLocations[0]?.[0] ?? "—"}
                </span>
            </div>

            {/* INT / EXT distribution */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>INT / EXT Split</span>
                <div className={styles.cardChart}>
                    <Doughnut data={settingData} options={doughnutOpts} />
                </div>
            </div>

            {/* Top locations */}
            <div className={styles.cardFull}>
                <span className={styles.cardTitle}>Top Locations by Scene Count</span>
                <div className={styles.cardChartTall}>
                    <Bar data={barData} options={barOpts} />
                </div>
            </div>
        </div>
    );
}
