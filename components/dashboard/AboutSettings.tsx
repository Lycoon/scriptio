import ScriptioLogo from "@public/images/scriptio.svg";
import { Tag, GitCommit } from "lucide-react";
import styles from "./AboutSettings.module.css";

const AboutSettings = () => {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    const buildId = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "local";

    return (
        <div className={styles.container}>
            <div className={styles.brandSection}>
                <div className={styles.logoWrapper}>
                    <ScriptioLogo className={styles.logo} />
                </div>
                <h1 className={styles.title}>Scriptio</h1>
                <p className={styles.copyright}>© {new Date().getFullYear()} Arko Logic</p>
            </div>

            <div className={styles.infoSection}>
                <div className={styles.row}>
                    <div className={styles.labelGroup}>
                        <Tag size={18} className={styles.icon} />
                        <span className={styles.label}>Version</span>
                    </div>
                    <span className={styles.value}>v{version}</span>
                </div>
                <div className={styles.row}>
                    <div className={styles.labelGroup}>
                        <GitCommit size={18} className={styles.icon} />
                        <span className={styles.label}>Build</span>
                    </div>
                    <span className={styles.value}>{buildId}</span>
                </div>
            </div>
        </div>
    );
};

export default AboutSettings;
