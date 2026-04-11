import styles from "./AboutSettings.module.css";

const AboutSettings = () => {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    const buildId = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "local";

    return (
        <div className={styles.container}>
            <div className={styles.row}>
                <span className={styles.label}>Version</span>
                <span className={styles.value}>v{version}</span>
            </div>
            <div className={styles.row}>
                <span className={styles.label}>Build</span>
                <span className={styles.value}>{buildId}</span>
            </div>
        </div>
    );
};

export default AboutSettings;
