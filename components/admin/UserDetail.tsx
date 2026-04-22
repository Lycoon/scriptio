"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { UserRole, SubscriptionProvider, ProjectRole } from "@prisma/client";
import styles from "./UserDetail.module.css";

type UserDetailPayload = {
    user: {
        id: string;
        email: string;
        createdAt: string;
        emailVerified: string | null;
        username: string | null;
        role: UserRole;
        isProUntil: string | null;
        isSubscriptionCancelled: boolean;
        subscriptionProvider: SubscriptionProvider | null;
    };
    projectCount: number;
    transactionCount: number;
};

type Membership = {
    role: ProjectRole;
    project: {
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
    };
};

type Transaction = {
    id: number;
    provider: SubscriptionProvider;
    transactionId: string;
    createdAt: string;
};

function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function isPro(isProUntil: string | null) {
    return !!isProUntil && new Date(isProUntil) > new Date();
}

type Props = { userId: string };

export default function UserDetail({ userId }: Props) {
    const { data, error, isLoading } = useSWR<UserDetailPayload>(
        `/api/admin/users/${userId}`,
    );
    const { data: memberships } = useSWR<Membership[]>(
        `/api/admin/users/${userId}/projects`,
    );
    const { data: transactions } = useSWR<Transaction[]>(
        `/api/admin/users/${userId}/transactions`,
    );

    return (
        <div className={styles.container}>
            <Link href="/admin/users" className={styles.backLink}>
                <ArrowLeft size={14} /> Back to search
            </Link>

            {isLoading && <p className={styles.message}>Loading user…</p>}
            {error && <p className={`${styles.message} ${styles.error}`}>User not found.</p>}

            {data && (
                <>
                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>Account</h2>
                        <div className={styles.fields}>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Email</span>
                                <span className={styles.fieldValue}>{data.user.email}</span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>User ID</span>
                                <span className={`${styles.fieldValue} ${styles.idValue}`}>
                                    {data.user.id}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Username</span>
                                <span className={styles.fieldValue}>
                                    {data.user.username ?? "—"}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Created</span>
                                <span className={styles.fieldValue}>
                                    {formatDateTime(data.user.createdAt)}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Email verified</span>
                                <span className={styles.fieldValue}>
                                    {data.user.emailVerified
                                        ? formatDateTime(data.user.emailVerified)
                                        : "No"}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Role</span>
                                <span
                                    className={`${styles.badge} ${
                                        data.user.role === UserRole.ADMIN
                                            ? styles.badgeAdmin
                                            : styles.badgeMuted
                                    }`}
                                >
                                    {data.user.role}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>Subscription</h2>
                        <div className={styles.fields}>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Status</span>
                                <span
                                    className={`${styles.badge} ${
                                        isPro(data.user.isProUntil)
                                            ? styles.badgePro
                                            : styles.badgeMuted
                                    }`}
                                >
                                    {isPro(data.user.isProUntil) ? "Pro" : "Free"}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Pro until</span>
                                <span className={styles.fieldValue}>
                                    {formatDateTime(data.user.isProUntil)}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Provider</span>
                                <span className={styles.fieldValue}>
                                    {data.user.subscriptionProvider ?? "—"}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Cancelled</span>
                                <span
                                    className={`${styles.badge} ${
                                        data.user.isSubscriptionCancelled
                                            ? styles.badgeDanger
                                            : styles.badgeMuted
                                    }`}
                                >
                                    {data.user.isSubscriptionCancelled ? "Yes" : "No"}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            Projects ({data.projectCount})
                        </h2>
                        <div className={styles.table}>
                            <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                                <span>Title</span>
                                <span>Role</span>
                                <span>Updated</span>
                            </div>
                            {!memberships && (
                                <div className={styles.emptyRow}>Loading…</div>
                            )}
                            {memberships && memberships.length === 0 && (
                                <div className={styles.emptyRow}>
                                    This user has no projects.
                                </div>
                            )}
                            {memberships?.map((m) => (
                                <div key={m.project.id} className={styles.tableRow}>
                                    <span>{m.project.title}</span>
                                    <span className={styles.tableCellMuted}>{m.role}</span>
                                    <span className={styles.tableCellMuted}>
                                        {formatDateTime(m.project.updatedAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            Transactions ({data.transactionCount})
                        </h2>
                        <div className={styles.table}>
                            <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                                <span>Transaction ID</span>
                                <span>Provider</span>
                                <span>Created</span>
                            </div>
                            {!transactions && (
                                <div className={styles.emptyRow}>Loading…</div>
                            )}
                            {transactions && transactions.length === 0 && (
                                <div className={styles.emptyRow}>No transactions.</div>
                            )}
                            {transactions?.map((t) => (
                                <div key={t.id} className={styles.tableRow}>
                                    <span
                                        className={styles.tableCellMono}
                                        title={t.transactionId}
                                    >
                                        {t.transactionId}
                                    </span>
                                    <span className={styles.tableCellMuted}>{t.provider}</span>
                                    <span className={styles.tableCellMuted}>
                                        {formatDateTime(t.createdAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
