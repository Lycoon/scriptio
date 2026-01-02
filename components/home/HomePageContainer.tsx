import LandingPageNavbar from '@components/navbar/LandingPageNavbar';
import styles from './Landing.module.css';

import { Feather, Layout, WifiOff, Code, CheckCircle, ArrowRight, MessageSquare, MessagesSquare, Eye, Clapperboard, ChartPie, Cloud } from 'lucide-react';

export default function HomePageContainer() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.gradientBackground}></div>

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

            <main className={styles.contentContainer}>
                {/* Hero Section */}
                <section className={styles.hero}>
                    <div className={styles.logoContainer}>
                        <img
                            src="/images/scriptio.png"
                            alt="Scriptio Logo"
                            className={styles.logoImage}
                            width={600}
                            height={180}
                        />
                    </div>

                    <div className={styles.catchphrase}>
                        Screenwriters First.
                    </div>
                    <div className={styles.subheadline}>Stop overpaying for Final Draft. Stop struggling with FadeIn clunky interface. Break free from Arc Studio, WriterSolo or Celtx free plan limits.</div>
                </section>

                {/* Pillars Section */}
                <section id="about" className={styles.pillarsSection}>
                    <div className={styles.pillarsGrid}>

                        {/* Pillar 1 */}
                        <div className={`${styles.glassCard} ${styles.pillarCard}`}>
                            <div className={styles.pillarHeader}>
                                <div className={styles.iconCircle}>
                                    <Layout size={28} />
                                </div>
                                <h3 className={styles.pillarTitle}>Modernity</h3>
                            </div>
                            <p className={styles.pillarText}>
                                Cloud or offline. Browser or Desktop. Experience a fluid interface, customizable themes, and also <strong>real-time collaboration</strong> without friction
                            </p>
                        </div>

                        {/* Pillar 2 */}
                        <div className={`${styles.glassCard} ${styles.pillarCard}`}>
                            <div className={styles.pillarHeader}>
                                <div className={styles.iconCircle}>
                                    <Feather size={28} />
                                </div>
                                <h3 className={styles.pillarTitle}>Simplicity</h3>
                            </div>
                            <p className={styles.pillarText}>
                                Designed from the ground up to free your mind with intuitive workflow. We focus on getting the best out of existing screenwriting tools
                            </p>
                        </div>

                        {/* Pillar 3 */}
                        <div className={`${styles.glassCard} ${styles.pillarCard}`}>
                            <div className={styles.pillarHeader}>
                                <div className={styles.iconCircle}>
                                    <Code size={28} />
                                </div>
                                <h3 className={styles.pillarTitle}>Transparency</h3>
                            </div>
                            <p className={styles.pillarText}>
                                Nothing to hide. In an effort of building trust, Scriptio is <strong>source-available</strong> as opposed to most well-established screenwriting software
                            </p>
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

                        {/* Distraction-Free Editor */}
                        <div className={`${styles.glassCard} ${styles.bentoCell} ${styles.span2}`}>
                            <div className={styles.bentoHeader}>
                                <Eye size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Distraction-Free Editor</h3>
                            </div>
                            <p className={styles.pillarText}>Type without interface clutter. Focus mode emphasizes the current line while fading out the noise.</p>
                            <div className={styles.mockEditor}>
                                <div className={styles.mockLine} style={{ width: '40%' }}></div>
                                <div className={styles.mockLine} style={{ width: '80%' }}></div>
                                <div className={styles.mockLine} style={{ width: '90%' }}></div>
                                <div className={styles.mockLine} style={{ width: '60%' }}></div>
                            </div>
                        </div>

                        {/* Cloud Sync */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <Cloud size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Cloud Sync</h3>
                            </div>
                            <p className={styles.pillarText}>Never hit Save again. Your words are synced to the cloud regularly. Switch devices, close tabs, or lose power—your story is always safe.</p>
                        </div>

                        {/* Themes */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <h3 className={styles.pillarTitle}>Custom Themes</h3>
                            </div>
                            <p className={styles.pillarText}>Whether you write at the crack of dawn or burn the midnight oil, find the perfect contrast for your eyes.</p>
                        </div>

                        {/* Industry Formats */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <h3 className={styles.pillarTitle}>Industry Formats</h3>
                            </div>
                            <p className={styles.pillarText}>Complete interoperability, allowing you to effortlessly import existing scripts or export in universally accepted formats like PDF, FDX, and Fountain</p>
                        </div>

                        {/* Scene Navigation */}
                        <div className={`${styles.glassCard} ${styles.bentoCell} ${styles.span2}`}>
                            <div className={styles.bentoHeader}>
                                <Clapperboard size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Scene Navigation</h3>
                            </div>
                            <p className={styles.pillarText}>Navigate your screenplay at the speed of thought with a dynamic scene outline. Track pacing with automatic length estimates and move fluidly through your story.</p>
                        </div>

                        {/* Character Management */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <h3 className={styles.pillarTitle}>Character Management</h3>
                            </div>
                            <p className={styles.pillarText}>Rename your characters in a snap, describe and assign them traits to generate statistics</p>
                        </div>

                        {/* Offline */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <WifiOff size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Offline First</h3>
                            </div>
                            <p className={styles.pillarText}>No internet? No problem. Your project is in safe hands, keep working with no friction. Once connection is back, your project will be synced back seamlessly.</p>
                        </div>

                        {/* Statistics */}
                        <div className={`${styles.glassCard} ${styles.bentoCell}`}>
                            <div className={styles.bentoHeader}>
                                <ChartPie size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Statistics</h3>
                            </div>
                            <p className={styles.pillarText}>Rename your characters in a snap, describe and assign them traits to generate statistics</p>
                        </div>

                        {/* Real-time Collaboration */}
                        <div className={`${styles.glassCard} ${styles.bentoCell} ${styles.span2}`}>
                            <div className={styles.bentoHeader}>
                                <MessagesSquare size={24} style={{ color: 'var(--secondary-text)' }} />
                                <h3 className={styles.pillarTitle}>Real-time Collaboration</h3>
                            </div>
                            <p className={styles.pillarText}>Manage a project with up to 5 collaborators. Write together in realtime.</p>
                        </div>

                    </div>
                </section>

            </main>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <div>
                        <p>© 2026 Scriptio by ArkoLogic</p>
                    </div>
                    <div className={styles.footerLinks}>
                        <a href="#" className={styles.navLink}>Privacy</a>
                        <a href="#" className={styles.navLink}>Terms</a>
                        <a href="https://github.com/Lycoon/scriptio" target="_blank" className={styles.navLink}>GitHub</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

interface ScriptStripeProps {
    children: React.ReactNode;
    speed?: 'slow' | 'medium' | 'fast';
    direction?: 'left' | 'right';
    opacity?: number;
}

const ScriptStripe: React.FC<ScriptStripeProps> = ({
    children,
    speed = 'medium',
    direction = 'left',
    opacity
}) => {
    const repetitions = [1, 2, 3, 4, 5, 6, 7, 8];

    return (
        <div className={styles.stripe}>
            <div className={`${styles.track} ${direction === 'left' ? styles.scrollLeft : styles.scrollRight} ${styles[speed]}`}>
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