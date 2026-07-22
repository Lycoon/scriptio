"use client";

import styles from "./Landing.module.css";
import navbar from "@components/navbar/LandingPageNavbar.module.css";

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={styles.footerContent}>
                <div>
                    <p>© 2026 Scriptio by ArkoLogic</p>
                </div>
                <div className={styles.footerLinks}>
                    <a href="/privacy" className={navbar.navLink}>
                        Privacy
                    </a>
                    <a href="/contact" className={navbar.navLink}>
                        Contact
                    </a>
                    <a href="https://github.com/Lycoon/scriptio" target="_blank" className={navbar.navLink}>
                        GitHub
                    </a>
                </div>
            </div>
        </footer>
    );
}
