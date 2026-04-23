"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Users, FolderOpen, LogOut } from "lucide-react";
import styles from "./AdminShell.module.css";

type NavLink = { href: string; label: string; icon: ReactNode };

const NAV_LINKS: NavLink[] = [
    { href: "/admin", label: "Overview", icon: <BarChart3 size={16} /> },
    { href: "/admin/users", label: "Users", icon: <Users size={16} /> },
    { href: "/admin/projects", label: "Projects", icon: <FolderOpen size={16} /> },
];

type Props = {
    email: string;
    title: string;
    subtitle?: string;
    children: ReactNode;
};

export default function AdminShell({ email, title, subtitle, children }: Props) {
    const pathname = usePathname() ?? "";

    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}>
                <div className={styles.brand}>
                    Scriptio
                    <span className={styles.brandBadge}>Admin</span>
                </div>
                <nav className={styles.nav}>
                    <div className={styles.navGroupLabel}>Monitoring</div>
                    {NAV_LINKS.map((link) => {
                        const active =
                            link.href === "/admin"
                                ? pathname === "/admin"
                                : pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                            >
                                {link.icon}
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>
                <div className={styles.footer}>
                    <span className={styles.footerEmail} title={email}>
                        {email}
                    </span>
                    <Link href="/" className={styles.navItem} style={{ padding: "8px 0" }}>
                        <LogOut size={14} />
                        Back to app
                    </Link>
                </div>
            </aside>
            <main className={styles.main}>
                <div className={styles.header}>
                    <h1 className={styles.title}>{title}</h1>
                    {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
                </div>
                {children}
            </main>
        </div>
    );
}
