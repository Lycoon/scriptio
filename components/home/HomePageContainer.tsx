"use client";

import styles from "./Landing.module.css";
import { WifiOff, MessagesSquare, Eye, Clapperboard, ChartPie, Cloud, Globe, Search } from "lucide-react";
import Footer from "./Footer";

export default function HomePageContainer() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.gradientBackground}></div>

            {/* Layer 0: Marquee Stripes (Background) */}
            <div className={styles.marqueeContainer}>
                <ScriptStripe speed="slow" direction="left">
                    INT. COFFEE SHOP - DAY — The steam rises slowly from the cup.
                </ScriptStripe>
                <ScriptStripe speed="fast" direction="right">
                    EXT. CITY STREET - NIGHT — Rain slicks the pavement neon.
                </ScriptStripe>
                <ScriptStripe speed="medium" direction="left" opacity={0.25}>
                    FADE IN: A world built for storytellers. CUT TO:
                </ScriptStripe>
                <ScriptStripe speed="fast" direction="right">
                    (V.O.) "It starts with a single page..."
                </ScriptStripe>
                <ScriptStripe speed="slow" direction="left">
                    CLOSE UP on the keyboard. Fingers flying. DISSOLVE TO:
                </ScriptStripe>
            </div>

            {/* Layer 1: Main Content Container */}
            <div className={styles.contentContainer}>
                {/* Hero Section */}
                <section id="about" className={styles.hero}>
                    {/* Layer 1.1: Preview Image (Behind Content, In Front of Stripes) */}
                    <div className={styles.heroBackgroundWrapper}>
                        <img
                            src="/images/preview.png"
                            alt="Scriptio Interface Preview"
                            className={styles.heroBackgroundImage}
                        />
                    </div>

                    {/* Layer 1.2: Branding (Logo) */}
                    <div className={styles.heroHeader}>
                        <img src="/images/scriptio_full.png" alt="Scriptio Logo" className={styles.heroLogo} />
                    </div>

                    {/* Layer 1.3: Platform CTAs */}
                    <div className={styles.heroContent}>
                        <div className={styles.ctaRow}>
                            <a
                                href="https://apps.apple.com/app/scriptio"
                                target="_blank"
                                className={styles.ctaPlatform}
                            >
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                                </svg>
                                <div className={styles.ctaPlatformText}>
                                    <span className={styles.ctaPlatformLabel}>Get it on</span>
                                    <span className={styles.ctaPlatformName}>App Store</span>
                                </div>
                            </a>

                            <a
                                href="https://apps.microsoft.com/detail/9p4m1xphjks1"
                                target="_blank"
                                className={styles.ctaPlatform}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z" />
                                </svg>
                                <div className={styles.ctaPlatformText}>
                                    <span className={styles.ctaPlatformLabel}>Get it on</span>
                                    <span className={styles.ctaPlatformName}>Microsoft Store</span>
                                </div>
                            </a>

                            <a href="/signup" className={styles.ctaPlatform}>
                                <Globe size={22} />
                                <div className={styles.ctaPlatformText}>
                                    <span className={styles.ctaPlatformLabel}>Open in</span>
                                    <span className={styles.ctaPlatformName}>Browser</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </section>

                {/* Bento Grid Features */}
                <section id="features" className={styles.bentoSection}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Everything you need.</h2>
                        <p className={styles.subheadline}>Power features packed into a minimalist interface.</p>
                    </div>

                    <div className={styles.bentoGrid}>
                        {/* First-class Editor */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Eye size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>First-class Editor</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Type without interface clutter. Focus mode emphasizes the current line while fading
                                    out the noise.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <img
                                    src="/images/previews/auto-complete.png"
                                    alt="Auto-complete Preview"
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Cloud Sync */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Cloud size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Cloud Sync</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Never hit Save again. Your words are synced to the cloud regularly. Switch devices,
                                    close tabs, or lose power—your story is always safe.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <img
                                    src="/images/previews/auto-complete.png"
                                    alt="Editor Preview"
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Advanced Search */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Search size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Advanced Search</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Search your script with precision using filters for scene, character, and dialogue.
                                    Replace with confidence using live preview.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <img
                                    src="/images/previews/search.png"
                                    alt="Search Preview"
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Themes */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <h3 className={styles.pillarTitle}>Custom Themes</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Whether you write at the crack of dawn or burn the midnight oil, find the perfect
                                    contrast for your eyes.
                                </p>
                            </div>
                            <img src="/images/previews/themes.png" alt="Themes Preview" className={styles.bentoImage} />
                        </div>

                        {/* Industry Formats */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <h3 className={styles.pillarTitle}>Industry Formats</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Complete interoperability, allowing you to effortlessly import existing scripts or
                                    export in universally accepted formats like PDF, FDX, and Fountain
                                </p>
                            </div>
                            <img
                                src="/images/previews/formats.png"
                                alt="Formats Preview"
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Scene Navigation */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Clapperboard size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Scene Navigation</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Navigate your screenplay at the speed of thought with a dynamic scene outline. Track
                                    pacing with automatic length estimates and move fluidly through your story.
                                </p>
                            </div>
                            <img
                                src="/images/previews/scene-navigation.png"
                                alt="Scene Navigation Preview"
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Character Management */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <h3 className={styles.pillarTitle}>Character Management</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Rename your characters in a snap, describe and assign them traits to generate
                                    statistics
                                </p>
                            </div>
                            <img
                                src="/images/previews/character-highlight.png"
                                alt="Character Highlight Preview"
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Offline */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <WifiOff size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Offline First</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    No internet? No problem. Your project is in safe hands, keep working with no
                                    friction. Once connection is back, your project will be synced back seamlessly.
                                </p>
                            </div>
                            <img
                                src="/images/previews/auto-complete.png"
                                alt="Editor Preview"
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Statistics */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <ChartPie size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Statistics</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Rename your characters in a snap, describe and assign them traits to generate
                                    statistics
                                </p>
                            </div>
                            <img
                                src="/images/previews/auto-complete.png"
                                alt="Editor Preview"
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Real-time Collaboration */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <MessagesSquare size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Real-time Collaboration</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Manage a project with up to 5 collaborators. Write and brainstorm together in
                                    realtime.
                                </p>
                            </div>
                            <img
                                src="/images/previews/collaboration.png"
                                alt="Collaboration Preview"
                                className={styles.bentoImage}
                            />
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section id="faq" className={styles.faqSection}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
                    </div>

                    <div className={styles.faqList}>
                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>Is Scriptio free to use?</summary>
                            <p className={styles.faqAnswer}>
                                Scriptio is free to use for most of its features. No project limitation, no forced
                                watermark on PDF generation. Only advanced features such as real-time collaboration and
                                report generation are part of our Pro plan, which is available for a reasonable monthly
                                fee.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>Can I use Scriptio offline?</summary>
                            <p className={styles.faqAnswer}>
                                Absolutely. The desktop app works fully offline. When you sign in and reconnect, your
                                changes sync automatically to the cloud.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>What export formats are supported?</summary>
                            <p className={styles.faqAnswer}>
                                You can export your screenplays as PDF, FDX (Final Draft), and Fountain. You can also
                                import from these formats.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>How does real-time collaboration work?</summary>
                            <p className={styles.faqAnswer}>
                                You can invite up to 5 collaborators to a project. Everyone edits the same screenplay
                                simultaneously with changes appearing in real time.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>Is my data safe?</summary>
                            <p className={styles.faqAnswer}>
                                Your data is hosted entirely on European servers, passwords are securely hashed, and all
                                communications are encrypted with TLS. We never sell or share your data. Read more in
                                our <a href="/privacy">privacy policy</a>.
                            </p>
                        </details>

                        <details className={styles.faqItem}>
                            <summary className={styles.faqQuestion}>Is Scriptio open source?</summary>
                            <p className={styles.faqAnswer}>
                                Scriptio is source-available. You can inspect the full codebase on{" "}
                                <a href="https://github.com/Lycoon/scriptio" target="_blank">
                                    GitHub
                                </a>
                                .
                            </p>
                        </details>
                    </div>
                </section>
            </div>

            <Footer />
        </div>
    );
}

interface ScriptStripeProps {
    children: React.ReactNode;
    speed?: "slow" | "medium" | "fast";
    direction?: "left" | "right";
    opacity?: number;
}

const ScriptStripe: React.FC<ScriptStripeProps> = ({ children, speed = "medium", direction = "left", opacity }) => {
    const repetitions = [1, 2, 3, 4, 5, 6, 7, 8];

    return (
        <div className={styles.stripe}>
            <div
                className={`${styles.track} ${direction === "left" ? styles.scrollLeft : styles.scrollRight} ${
                    styles[speed]
                }`}
            >
                {/* First Set */}
                {repetitions.map((i) => (
                    <span key={`a-${i}`} className={styles.stripeText} style={opacity ? { opacity } : {}}>
                        {children} <span className={styles.cursor}></span>
                    </span>
                ))}

                {/* Duplicate Set (Required for seamless CSS loop) */}
                {repetitions.map((i) => (
                    <span key={`b-${i}`} className={styles.stripeText} style={opacity ? { opacity } : {}}>
                        {children} <span className={styles.cursor}></span>
                    </span>
                ))}
            </div>
        </div>
    );
};
