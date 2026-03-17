"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCookieUser } from "@src/lib/utils/hooks";
import { importFileAsProject, getSupportedImportExtensions } from "@src/lib/import/import-project";
import styles from "./EmptyProjectPage.module.css";
import { useTranslations } from "next-intl";

type Props = {
    setIsCreating: (isCreating: boolean) => void;
};

const EmptyProjectPage = ({ setIsCreating }: Props) => {
    const { user } = useCookieUser();
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
            const result = await importFileAsProject(file, user);

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
            <div className={styles.content}>
                <button className={styles.main_btn} onClick={() => setIsCreating(true)}>
                    <p className={styles.title}>{t("empty.createFirst")}</p>
                </button>
                <p className={styles.or_text}>{t("empty.or")}</p>
                <button
                    className={styles.import_btn}
                    onClick={handleImportClick}
                    disabled={isImporting}
                >
                    {isImporting ? t("importing") : t("empty.importExisting")}
                </button>
            </div>
        </div>
    );
};

export default EmptyProjectPage;
