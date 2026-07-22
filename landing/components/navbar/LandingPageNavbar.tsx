"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

import styles from "./LandingPageNavbar.module.css";

// The static landing only has three routes; derive the current one from the
// pathname (mirrors the app's usePage() without pulling in the app's hooks).
type LandingPage = "index" | "privacy" | "contact";

function usePage(): LandingPage | undefined {
    const pathname = usePathname();
    if (!pathname) return undefined;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "index";
    const last = segments[segments.length - 1];
    return last === "privacy" || last === "contact" ? last : "index";
}

export default function LandingPageNavbar() {
    const page = usePage();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    useEffect(() => {
        const readScrollY = (target: EventTarget | null): number => {
            if (!target || target === document) return window.scrollY;
            if (target instanceof HTMLElement) return target.scrollTop;
            return 0;
        };
        const onScroll = (e: Event) => {
            setScrolled(readScrollY(e.target) > 16);
        };
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        return () => document.removeEventListener("scroll", onScroll, { capture: true });
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    if (!page) return null;

    const close = () => setOpen(false);

    return (
        <nav className={`${styles.navbar} ${scrolled ? styles.navbarScrolled : ""}`}>
            {page !== "index" && (
                <Link className={styles.logoWrapper} href="/">
                    <Image
                        src="/_site/images/scriptio.png"
                        alt="Scriptio Logo"
                        width={90}
                        height={27}
                        className={styles.logo}
                    />
                </Link>
            )}

            <div className={styles.navLinks}>
                {page === "index" && (
                    <>
                        <Link className={styles.navLink} href="#features">Features</Link>
                        <Link className={styles.navLink} href="#faq">FAQ</Link>
                        <Link className={styles.navLink} href="#pricing">Pricing</Link>
                    </>
                )}
            </div>

            <div className={styles.navLinks}>
                <Link className={styles.navLink} href="/contact">Contact</Link>
                <Link className={styles.navLink} href="/privacy">Privacy</Link>
            </div>

            <button
                className={styles.burgerBtn}
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
            >
                {open ? <X size={22} /> : <Menu size={22} />}
            </button>

            {open && (
                <div className={styles.mobileMenu}>
                    {page === "index" && (
                        <>
                            <Link className={styles.mobileLink} href="#features" onClick={close}>Features</Link>
                            <Link className={styles.mobileLink} href="#faq" onClick={close}>FAQ</Link>
                            <Link className={styles.mobileLink} href="#pricing" onClick={close}>Pricing</Link>
                        </>
                    )}
                    <Link className={styles.mobileLink} href="/contact" onClick={close}>Contact</Link>
                    <Link className={styles.mobileLink} href="/privacy" onClick={close}>Privacy</Link>
                </div>
            )}
        </nav>
    );
}
