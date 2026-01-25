"use client";

import { usePage } from "@src/lib/utils/hooks";
import Link from "next/link";

import styles from "./LandingPageNavbar.module.css";

export default function LandingPageNavbar() {
    const page = usePage();
    if (!page) return null;

    return (
        <div className={styles.navbar}>
            <div className={styles.navLinks}>
                {page === "index" ? (
                    <>
                        <Link className={styles.navLink} href="#features">
                            Features
                        </Link>
                        <Link className={styles.navLink} href="#pricing">
                            Pricing
                        </Link>
                    </>
                ) : (
                    <Link className={styles.logoWrapper} href="/">
                        <img src="/images/scriptio.png" alt="Scriptio Logo" className={styles.logo} />
                    </Link>
                )}
            </div>
            <div className={styles.navLinks}>
                <Link className={styles.navLink} href="/login">
                    Log in
                </Link>
                <Link className={styles.navLink} href="/signup">
                    Sign up
                </Link>
            </div>
        </div>
    );
}
