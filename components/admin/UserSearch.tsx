"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search } from "lucide-react";
import { UserRole, SubscriptionProvider } from "../../src/generated/client/browser";
import styles from "./UserSearch.module.css";

type SearchResult = {
    id: string;
    email: string;
    createdAt: string;
    role: UserRole;
    isProUntil: string | null;
    subscriptionProvider: SubscriptionProvider | null;
};

type SearchResponse = {
    users: SearchResult[];
    nextCursor: number | null;
};

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isPro(isProUntil: string | null) {
    return !!isProUntil && new Date(isProUntil) > new Date();
}

export default function UserSearch() {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const key = debounced
        ? `/api/admin/users?q=${encodeURIComponent(debounced)}`
        : `/api/admin/users?limit=10`;
    const { data, isLoading } = useSWR<SearchResponse>(key);

    return (
        <div className={styles.container}>
            <div className={styles.searchBar}>
                <Search size={16} />
                <input
                    className={styles.searchInput}
                    placeholder="Search by email or user ID"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            {!debounced && isLoading && <p className={styles.hint}>Loading…</p>}

            {debounced && isLoading && <p className={styles.hint}>Searching…</p>}

            {debounced && data && data.users.length === 0 && (
                <div className={styles.resultList}>
                    <div className={styles.empty}>No users match &quot;{debounced}&quot;.</div>
                </div>
            )}

            {data && data.users.length > 0 && (
                <div className={styles.resultList}>
                    {data.users.map((u) => (
                        <Link key={u.id} href={`/admin/users/${u.id}`} className={styles.resultRow}>
                            <span className={styles.email}>{u.email}</span>
                            <span className={styles.id}>{u.id}</span>
                            <span
                                className={`${styles.badge} ${
                                    u.role === UserRole.ADMIN
                                        ? styles.badgeAdmin
                                        : isPro(u.isProUntil)
                                          ? styles.badgePro
                                          : styles.badgeMuted
                                }`}
                            >
                                {u.role === UserRole.ADMIN
                                    ? "Admin"
                                    : isPro(u.isProUntil)
                                      ? "Pro"
                                      : "Free"}
                            </span>
                            <span className={styles.date}>{formatDate(u.createdAt)}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
