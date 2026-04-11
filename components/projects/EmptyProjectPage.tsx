"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCookieUser, useIsPro } from "@src/lib/utils/hooks";
import { importFileAsProject, getSupportedImportExtensions } from "@src/lib/import/import-project";
import styles from "./EmptyProjectPage.module.css";
import { useTranslations } from "next-intl";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const EmptyProjectPage = ({ setIsCreating }: Props) => {
    const { user } = useCookieUser();
    const { isPro } = useIsPro();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const t = useTranslations("projects");

    const handleImportClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            const result = await importFileAsProject(file, user, undefined, isPro);

            if (result.success && result.projectId) {
                router.push(`/projects?projectId=${result.projectId}`);
            } else {
                console.error("Import failed:", result.error);
            }
        } catch (error) {
            console.error("Import error:", error);
        } finally {
            setIsImporting(false);
            event.target.value = "";
        }
    };

    return (
        <div className={styles.container}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept={getSupportedImportExtensions()}
                style={{ display: "none" }}
            />
            <div className={styles.cards}>
                <button className={styles.card} onClick={() => setIsCreating(true)}>
                    <div className={styles.cardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </div>
                    <p className={styles.cardTitle}>{t("empty.createFirst")}</p>
                    <p className={styles.cardDesc}>{t("empty.createDesc")}</p>
                </button>
                <button className={styles.card} onClick={handleImportClick} disabled={isImporting}>
                    <div className={styles.cardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    </div>
                    <p className={styles.cardTitle}>
                        {isImporting ? t("importing") : t("empty.importExisting")}
                    </p>
                    <p className={styles.cardDesc}>{t("empty.importDesc")}</p>
                </button>
            </div>
        </div>
    );
};

export default EmptyProjectPage;
