"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search } from "lucide-react";
import styles from "./ProjectSearch.module.css";

type ProjectResult = {
    id: string;
    title: string;
    author: string | null;
    createdAt: string;
    updatedAt: string;
    _count: { members: number };
};

type SearchResponse = {
    projects: ProjectResult[];
    nextCursor: number | null;
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default function ProjectSearch() {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const key = debounced
        ? `/api/admin/projects?q=${encodeURIComponent(debounced)}`
        : `/api/admin/projects?limit=10`;
    const { data, isLoading } = useSWR<SearchResponse>(key);

    return (
        <div className={styles.container}>
            <div className={styles.searchBar}>
                <Search size={16} />
                <input
                    className={styles.searchInput}
                    placeholder="Search by project title or project ID"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            {!debounced && isLoading && <p className={styles.hint}>Loading…</p>}

            {debounced && isLoading && <p className={styles.hint}>Searching…</p>}

            {debounced && data && data.projects.length === 0 && (
                <div className={styles.resultList}>
                    <div className={styles.empty}>No projects match &quot;{debounced}&quot;.</div>
                </div>
            )}

            {data && data.projects.length > 0 && (
                <div className={styles.resultList}>
                    {data.projects.map((p) => (
                        <Link key={p.id} href={`/admin/projects/${p.id}`} className={styles.resultRow}>
                            <span className={styles.title}>{p.title}</span>
                            <span className={styles.id}>{p.id}</span>
                            <span className={styles.members}>
                                {p._count.members} member{p._count.members !== 1 ? "s" : ""}
                            </span>
                            <span className={styles.date}>
                                Updated {formatDate(p.updatedAt)}
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
