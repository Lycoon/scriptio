"use client";

import { useContext, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { CharacterGender } from "@src/lib/screenplay/characters";
import { ScreenplayElement } from "@src/lib/utils/enums";
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
    female:  "#e07ba0",
    male:    "#6c8ebf",
    other:   "#82b366",
    unknown: "#9e9e9e",
    bar:     "rgba(108, 142, 191, 0.75)",
    barBorder: "rgba(108, 142, 191, 1)",
};

const CHART_TEXT_COLOR = "rgba(180, 180, 180, 0.9)";

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

// ── Dialogue counting ─────────────────────────────────────────────────────────

type ScreenplayNode = {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: ScreenplayNode[];
    text?: string;
};

function countDialoguePerCharacter(screenplay: ScreenplayNode[]): Record<string, number> {
    const counts: Record<string, number> = {};
    let currentChar: string | null = null;

    for (const node of screenplay) {
        const nodeType: string = (node.attrs?.["class"] as string) ?? node.type ?? "";

        if (nodeType === ScreenplayElement.Character) {
            // Extract plain text from the node's content array
            const text = (node.content ?? [])
                .flatMap((c) => c.content ?? [c])
                .map((c) => c.text ?? "")
                .join("")
                .toUpperCase()
                .replace(/\(.*?\)/g, "") // strip parentheticals like (V.O.)
                .trim();
            if (text) {
                currentChar = text;
                if (!counts[text]) counts[text] = 0;
            }
        } else if (nodeType === ScreenplayElement.Dialogue && currentChar) {
            counts[currentChar] = (counts[currentChar] ?? 0) + 1;
        } else if (
            nodeType !== ScreenplayElement.Parenthetical &&
            nodeType !== ScreenplayElement.Dialogue
        ) {
            // Any non-dialogue/parenthetical breaks the character block
            currentChar = null;
        }
    }

    return counts;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharactersStats() {
    const { screenplay, characters } = useContext(ProjectContext);

    const stats = useMemo(() => {
        const dialogueCounts = countDialoguePerCharacter(screenplay);

        // Top 10 by dialogue lines
        const topCharacters: [string, number][] = Object.entries(dialogueCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Gender breakdown from persistent characters
        const genderCount = { female: 0, male: 0, other: 0, unknown: 0 };
        for (const name of Object.keys(dialogueCounts)) {
            const charData = characters?.[name];
            if (!charData) { genderCount.unknown++; continue; }
            if (charData.gender === CharacterGender.FEMALE) genderCount.female++;
            else if (charData.gender === CharacterGender.MALE) genderCount.male++;
            else genderCount.other++;
        }

        const totalSpeaking = Object.keys(dialogueCounts).length;
        const totalLines = Object.values(dialogueCounts).reduce((a, b) => a + b, 0);

        return { topCharacters, genderCount, totalSpeaking, totalLines };
    }, [screenplay, characters]);

    if (stats.totalSpeaking === 0) {
        return <p className={styles.empty}>No character dialogue found yet.</p>;
    }

    // ── Bar chart — top characters ──────────────────────────────────────────────

    const barData = {
        labels: stats.topCharacters.map(([name]: [string, number]) => name),
        datasets: [{
            label: "Dialogue lines",
            data: stats.topCharacters.map(([, count]: [string, number]) => count),
            backgroundColor: stats.topCharacters.map((_: [string, number], i: number) =>
                `hsla(${210 + i * 8}, 55%, 55%, 0.75)`
            ),
            borderColor: stats.topCharacters.map((_: [string, number], i: number) =>
                `hsla(${210 + i * 8}, 55%, 55%, 1)`
            ),
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    // ── Doughnut — gender ───────────────────────────────────────────────────────

    const genderData = {
        labels: ["Female", "Male", "Other", "Unknown"],
        datasets: [{
            data: [
                stats.genderCount.female,
                stats.genderCount.male,
                stats.genderCount.other,
                stats.genderCount.unknown,
            ],
            backgroundColor: [PALETTE.female, PALETTE.male, PALETTE.other, PALETTE.unknown],
            borderWidth: 0,
        }],
    };

    return (
        <div className={styles.statsGrid}>
            {/* KPI cards */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Speaking Characters</span>
                <span className={styles.cardValue}>{stats.totalSpeaking}</span>
            </div>

            <div className={styles.card}>
                <span className={styles.cardTitle}>Total Dialogue Lines</span>
                <span className={styles.cardValue}>{stats.totalLines}</span>
            </div>

            {/* Gender distribution */}
            <div className={styles.card}>
                <span className={styles.cardTitle}>Gender Distribution</span>
                <div className={styles.cardChart}>
                    <Doughnut data={genderData} options={doughnutOpts} />
                </div>
            </div>

            {/* Top characters by dialogue */}
            <div className={styles.cardFull}>
                <span className={styles.cardTitle}>Top Characters by Dialogue Lines</span>
                <div className={styles.cardChartTall}>
                    <Bar data={barData} options={barOpts} />
                </div>
            </div>
        </div>
    );
}
