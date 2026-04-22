"use client";

import useSWR from "swr";
import styles from "./StatsCards.module.css";

type Stats = {
    userCount: number;
    activeProCount: number;
    projectCount: number;
    transactionsThisMonth: number;
};

export default function StatsCards() {
    const { data, error, isLoading } = useSWR<Stats>("/api/admin/stats");

    if (isLoading) return <div className={styles.loading}>Loading stats…</div>;
    if (error || !data) return <div className={styles.error}>Failed to load stats.</div>;

    const cards = [
        { label: "Users", value: data.userCount, hint: "All-time registrations" },
        { label: "Active Pro", value: data.activeProCount, hint: "isProUntil > now" },
        { label: "Projects", value: data.projectCount, hint: "All projects" },
        {
            label: "Transactions (this month)",
            value: data.transactionsThisMonth,
            hint: "Since the 1st",
        },
    ];

    return (
        <div className={styles.grid}>
            {cards.map((c) => (
                <div key={c.label} className={styles.card}>
                    <span className={styles.label}>{c.label}</span>
                    <span className={styles.value}>{c.value.toLocaleString()}</span>
                    <span className={styles.hint}>{c.hint}</span>
                </div>
            ))}
        </div>
    );
}
