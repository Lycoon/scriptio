"use client";

import { FileDown, Plus } from "lucide-react";
import styles from "./EmptyProjectPage.module.css";
import { useTranslations } from "next-intl";

type Props = {
    onCreate: () => void;
    onImport: () => void;
    isImporting: boolean;
};

const EmptyProjectPage = ({ onCreate, onImport, isImporting }: Props) => {
    const t = useTranslations("projects");

    return (
        <div className={styles.container}>
            <div className={styles.heading}>
                <p className={styles.title}>{t("empty.title")}</p>
                <p className={styles.subtitle}>{t("empty.subtitle")}</p>
            </div>
            <div className={styles.row}>
                <div className={styles.btnWrapper}>
                    <button className={styles.createBtn} onClick={onCreate}>
                        <Plus size={16} />
                        {t("empty.createFirst")}
                    </button>
                    <span className={styles.formats}>{t("empty.createDesc")}</span>
                </div>
                <div className={styles.btnWrapper}>
                    <button className={styles.importBtn} onClick={onImport} disabled={isImporting}>
                        <FileDown size={15} />
                        {isImporting ? t("importing") : t("empty.importExisting")}
                    </button>
                    <span className={styles.formats}>.fountain · .fdx · .txt · .scriptio</span>
                </div>
            </div>
        </div>
    );
};

export default EmptyProjectPage;
