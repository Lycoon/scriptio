"use client";

import styles from "./Landing.module.css";
import {
    WifiOff,
    MessagesSquare,
    Clapperboard,
    ChartPie,
    Cloud,
    Globe,
    Search,
    PenLine,
    Ruler,
    FileOutput,
    Palette,
    Users,
} from "lucide-react";
import Footer from "./Footer";
import Image from "next/image";
import { useState } from "react";
import { AppleIcon, GooglePlayIcon, LinuxIcon, WindowsIcon } from "./PlatformIcons";

// The app lives at the same origin in production (`/projects` is relative), but
// at a different port in local dev. NEXT_PUBLIC_APP_ORIGIN is set to the app's
// dev URL in .env.development and is empty in the production build.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "";

const APP_STORE_URL = "https://apps.apple.com/app/scriptio";
const MICROSOFT_STORE_URL = "https://apps.microsoft.com/detail/9p4m1xphjks1";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=app.scriptio";

const DESKTOP_STORES: StoreLink[] = [
    { href: APP_STORE_URL, name: "App Store", icon: <AppleIcon size={18} /> },
    { href: MICROSOFT_STORE_URL, name: "Microsoft Store", icon: <WindowsIcon size={16} /> },
];

const MOBILE_STORES: StoreLink[] = [
    { href: APP_STORE_URL, name: "App Store", icon: <AppleIcon size={18} /> },
    { href: GOOGLE_PLAY_URL, name: "Google Play", icon: <GooglePlayIcon size={17} /> },
];

export default function HomePageContainer() {
    // Which platform CTA has its store menu open (hover on pointer devices, tap
    // on touch ones — CSS handles hover/focus, this handles the tap).
    const [openMenu, setOpenMenu] = useState<"desktop" | "mobile" | null>(null);

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
                    (V.O.) &quot;It starts with a single page...&quot;
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
                        <Image
                            src="/_site/images/preview.png"
                            alt="Scriptio Interface Preview"
                            width={1920}
                            height={1080}
                            loading="eager"
                            className={styles.heroBackgroundImage}
                        />
                    </div>

                    {/* Layer 1.2: Branding (Logo) */}
                    <div className={styles.heroHeader}>
                        <Image src="/_site/images/scriptio_full.png" alt="Scriptio Logo" width={400} height={80} className={styles.heroLogo} />
                    </div>

                    {/* Layer 1.3: Platform CTAs */}
                    <div className={styles.heroContent}>
                        <div className={styles.ctaRow}>
                            <PlatformMenuCta
                                name="Desktop"
                                icons={
                                    <>
                                        <AppleIcon size={20} />
                                        <WindowsIcon size={17} />
                                        <LinuxIcon size={20} />
                                    </>
                                }
                                stores={DESKTOP_STORES}
                                isOpen={openMenu === "desktop"}
                                onToggle={(open) => setOpenMenu(open ? "desktop" : null)}
                            />

                            <PlatformMenuCta
                                name="Mobile"
                                icons={
                                    <>
                                        <AppleIcon size={20} />
                                        <GooglePlayIcon size={18} />
                                    </>
                                }
                                stores={MOBILE_STORES}
                                isOpen={openMenu === "mobile"}
                                onToggle={(open) => setOpenMenu(open ? "mobile" : null)}
                            />

                            <a href={`${APP_ORIGIN}/projects`} className={styles.ctaPlatform}>
                                <div className={styles.ctaPlatformIcons}>
                                    <Globe size={20} />
                                </div>
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
                                    <PenLine size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>First-class Editor</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Smart auto-complete, built-in spellchecker, and keyboard shortcuts keep you in flow.
                                    Fountain syntax rules automatically format your script as you type. Focus mode fades
                                    out the noise so only your words remain.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <Image
                                    src="/_site/images/previews/auto-complete.png"
                                    alt="Auto-complete Preview"
                                    width={1280}
                                    height={720}
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Professional Formatting */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Ruler size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Professional Formatting</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Dual dialogue, customizable margins, font styling, and spacing — every layout detail
                                    is yours to control. Page breaks follow industry standards out of the box. Your
                                    script looks camera-ready from page one.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <Image
                                    src="/_site/images/previews/auto-complete.png"
                                    alt="Auto-complete Preview"
                                    width={1280}
                                    height={720}
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Industry Formats */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <FileOutput size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Industry Formats</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Import existing scripts or export in PDF, FDX, and Fountain with full fidelity.
                                    Switch tools without losing a single line of formatting. Your screenplay is never
                                    locked into one ecosystem.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/formats.png"
                                alt="Formats Preview"
                                width={1280}
                                height={720}
                                className={styles.bentoImage}
                            />
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
                                    Replace with confidence using live preview before committing any change. Find
                                    patterns across hundreds of pages in an instant.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <Image
                                    src="/_site/images/previews/search.png"
                                    alt="Search Preview"
                                    width={1280}
                                    height={720}
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Alternates */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Search size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Alternates</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Search your script with precision using filters for scene, character, and dialogue.
                                    Replace with confidence using live preview before committing any change. Find
                                    patterns across hundreds of pages in an instant.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <Image
                                    src="/_site/images/previews/search.png"
                                    alt="Search Preview"
                                    width={1280}
                                    height={720}
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Themes */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Palette size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Custom Themes</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Whether you write at the crack of dawn or burn the midnight oil, find the perfect
                                    contrast for your eyes. Choose from light & dark themes designed for long writing
                                    sessions. Your environment should inspire, not distract.
                                </p>
                            </div>
                            <Image src="/_site/images/previews/themes.png" alt="Themes Preview" width={1280} height={720} className={styles.bentoImage} />
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
                                    pacing with length estimates and jump anywhere in your script instantly. Reorder
                                    scenes, add synopses, and color-code your story structure.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/scene-navigation.png"
                                alt="Scene Navigation Preview"
                                width={1280}
                                height={720}
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Character Management */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Users size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Character Management</h3>
                                </div>
                                <p className={styles.pillarText}>
                                    Rename a character across your entire script in one click. Assign traits and
                                    descriptions to build rich character profiles. Highlight any character&apos;s lines to
                                    stay locked in their voice.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/character-highlight.png"
                                alt="Character Highlight Preview"
                                width={1280}
                                height={720}
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
                                    No internet? No problem. Keep writing without any friction or interruption. Your
                                    work is saved locally and synced back to the cloud the moment you reconnect.
                                    Scriptio works fully offline, no account required.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/auto-complete.png"
                                alt="Editor Preview"
                                width={1280}
                                height={720}
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
                                    Get a clear picture of your screenplay with word count, page count, and scene
                                    breakdowns. See how much screen time each character gets and spot pacing gaps at a
                                    glance. Data-driven insights to sharpen your story before it hits the screen.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/auto-complete.png"
                                alt="Editor Preview"
                                width={1280}
                                height={720}
                                className={styles.bentoImage}
                            />
                        </div>

                        {/* Cloud Sync */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <Cloud size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Cloud Sync</h3>
                                    <span className={styles.proBadge}>Pro</span>
                                </div>
                                <p className={styles.pillarText}>
                                    Never hit Save again — your words are synced to the cloud continuously. Switch
                                    devices, close tabs, or lose power and pick up exactly where you left off. Manual
                                    snapshots let you restore any previous version on demand.
                                </p>
                            </div>
                            <div className={styles.bentoImageWrapper}>
                                <Image
                                    src="/_site/images/previews/auto-complete.png"
                                    alt="Editor Preview"
                                    width={1280}
                                    height={720}
                                    className={styles.bentoImage}
                                />
                            </div>
                        </div>

                        {/* Real-time Collaboration */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoContent}>
                                <div className={styles.bentoHeader}>
                                    <MessagesSquare size={24} style={{ color: "var(--secondary-text)" }} />
                                    <h3 className={styles.pillarTitle}>Real-time Collaboration</h3>
                                    <span className={styles.proBadge}>Pro</span>
                                </div>
                                <p className={styles.pillarText}>
                                    Invite up to 5 collaborators and write the same screenplay simultaneously in real
                                    time. See each other&apos;s cursors, edits, and comments as they happen. No merging, no
                                    conflicts — just seamless creative flow.
                                </p>
                            </div>
                            <Image
                                src="/_site/images/previews/collaboration.png"
                                alt="Collaboration Preview"
                                width={1280}
                                height={720}
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

interface StoreLink {
    href: string;
    name: string;
    icon: React.ReactNode;
}

interface PlatformMenuCtaProps {
    name: string;
    icons: React.ReactNode;
    stores: StoreLink[];
    isOpen: boolean;
    onToggle: (open: boolean) => void;
}

const PlatformMenuCta: React.FC<PlatformMenuCtaProps> = ({ name, icons, stores, isOpen, onToggle }) => (
    <div
        className={`${styles.ctaMenu} ${isOpen ? styles.ctaMenuOpen : ""}`}
        onMouseEnter={() => onToggle(true)}
        onMouseLeave={() => onToggle(false)}
        onKeyDown={(e) => e.key === "Escape" && onToggle(false)}
    >
        <button
            type="button"
            className={styles.ctaPlatform}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={() => onToggle(!isOpen)}
        >
            <div className={styles.ctaPlatformIcons}>{icons}</div>
            <div className={styles.ctaPlatformText}>
                <span className={styles.ctaPlatformLabel}>Download for</span>
                <span className={styles.ctaPlatformName}>{name}</span>
            </div>
        </button>

        <div className={styles.ctaDropdown} role="menu" aria-label={`${name} downloads`}>
            <div className={styles.ctaDropdownPanel}>
                {stores.map((store) => (
                    <a
                        key={store.name}
                        href={store.href}
                        target="_blank"
                        role="menuitem"
                        className={styles.ctaDropdownItem}
                    >
                        {store.icon}
                        <span>{store.name}</span>
                    </a>
                ))}
            </div>
        </div>
    </div>
);

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
