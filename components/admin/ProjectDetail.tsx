"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { ProjectRole } from "../../src/generated/client/browser";
import styles from "./ProjectDetail.module.css";

type ProjectDetailPayload = {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    _count: { members: number; invitations: number };
};

type Member = {
    role: ProjectRole;
    user: { id: string; email: string };
};

type Invite = {
    email: string;
    createdAt: string;
};

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

type Props = { projectId: string };

export default function ProjectDetail({ projectId }: Props) {
    const { data, error, isLoading } = useSWR<ProjectDetailPayload>(
        `/api/admin/projects/${projectId}`,
    );
    const { data: members } = useSWR<Member[]>(
        `/api/admin/projects/${projectId}/members`,
    );
    const { data: invites } = useSWR<Invite[]>(
        `/api/admin/projects/${projectId}/invites`,
    );

    return (
        <div className={styles.container}>
            <Link href="/admin/projects" className={styles.backLink}>
                <ArrowLeft size={14} /> Back to search
            </Link>

            {isLoading && <p className={styles.message}>Loading project…</p>}
            {error && <p className={`${styles.message} ${styles.error}`}>Project not found.</p>}

            {data && (
                <>
                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>Project</h2>
                        <div className={styles.fields}>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Title</span>
                                <span className={styles.fieldValue}>{data.title}</span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Project ID</span>
                                <span className={`${styles.fieldValue} ${styles.idValue}`}>
                                    {data.id}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Author</span>
                                <span className={styles.fieldValue}>{data.author ?? "—"}</span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Description</span>
                                <span className={styles.fieldValue}>{data.description ?? "—"}</span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Created</span>
                                <span className={styles.fieldValue}>
                                    {formatDateTime(data.createdAt)}
                                </span>
                            </div>
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Last updated</span>
                                <span className={styles.fieldValue}>
                                    {formatDateTime(data.updatedAt)}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            Members ({data._count.members})
                        </h2>
                        <div className={styles.table}>
                            <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                                <span>Email</span>
                                <span>Role</span>
                            </div>
                            {!members && (
                                <div className={styles.emptyRow}>Loading…</div>
                            )}
                            {members && members.length === 0 && (
                                <div className={styles.emptyRow}>No members.</div>
                            )}
                            {members?.map((m) => (
                                <Link
                                    key={m.user.id}
                                    href={`/admin/users/${m.user.id}`}
                                    className={`${styles.tableRow} ${styles.tableRowLink}`}
                                >
                                    <span>{m.user.email}</span>
                                    <span className={styles.tableCellMuted}>{m.role}</span>
                                </Link>
                            ))}
                        </div>
                    </section>

                    <section className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            Pending invitations ({data._count.invitations})
                        </h2>
                        <div className={styles.table}>
                            <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                                <span>Email</span>
                                <span>Invited</span>
                            </div>
                            {!invites && (
                                <div className={styles.emptyRow}>Loading…</div>
                            )}
                            {invites && invites.length === 0 && (
                                <div className={styles.emptyRow}>No pending invitations.</div>
                            )}
                            {invites?.map((inv) => (
                                <div key={inv.email} className={styles.tableRow}>
                                    <span>{inv.email}</span>
                                    <span className={styles.tableCellMuted}>
                                        {formatDateTime(inv.createdAt)}
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
