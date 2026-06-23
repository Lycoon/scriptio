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
            <div className={styles.heading}>
                <p className={styles.title}>{t("empty.title")}</p>
                <p className={styles.subtitle}>{t("empty.subtitle")}</p>
            </div>
            <div className={styles.row}>
                <div className={styles.btnWrapper}>
                    <button className={styles.createBtn} onClick={() => setIsCreating(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        {t("empty.createFirst")}
                    </button>
                    <span className={styles.formats}>{t("empty.createDesc")}</span>
                </div>
                <div className={styles.btnWrapper}>
                    <button className={styles.importBtn} onClick={handleImportClick} disabled={isImporting}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        {isImporting ? t("importing") : t("empty.importExisting")}
                    </button>
                    <span className={styles.formats}>.fountain · .fdx · .txt · .scriptio</span>
                </div>
            </div>
        </div>
    );
};

export default EmptyProjectPage;
