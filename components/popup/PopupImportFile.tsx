"use client";

import popup from "./Popup.module.css";

import { Loader2, X } from "lucide-react";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupImportFileData, closePopup } from "@src/lib/screenplay/popup";
import { useContext, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useTranslations } from "next-intl";

const PopupImportFile = ({ data: { confirmImport } }: PopupData<PopupImportFileData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.import");
    const [isImporting, setIsImporting] = useState(false);

    const onConfirmImport = async () => {
        if (isImporting) return;
        setIsImporting(true);
        // Parsing the file and writing it into the editor/Yjs document is heavy
        // and runs on the main thread. Yield for a couple of frames first so the
        // button's loading state actually paints before that work blocks the UI,
        // rather than the popup vanishing and the app appearing to freeze.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        try {
            await confirmImport();
        } catch (error) {
            console.error("Import failed:", error);
        } finally {
            setIsImporting(false);
            closePopup(userCtx);
        }
    };

    // Block dismissal while an import is in flight so the document isn't left
    // half-written by a popup that closed mid-import.
    const dismiss = () => {
        if (!isImporting) closePopup(userCtx);
    };

    return (
        <div className={popup.window}>
            <div className={popup.container} style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
                <div
                    className={popup.header}
                    onMouseDown={handleMouseDown}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                    <h2 className={popup.title}>{t("title")}</h2>
                    <X className={popup.close_btn} onClick={dismiss} />
                </div>
                <div className={popup.info}>
                    <p>
                        {t.rich("warning", { b: (chunks) => <b>{chunks}</b> })}
                        <br />
                        {t("info")}
                    </p>
                </div>
                <div className={popup.buttons}>
                    <button className={popup.import_confirm} onClick={onConfirmImport} disabled={isImporting}>
                        {isImporting ? (
                            <span className={popup.loading}>
                                <Loader2 className={popup.spinner} size={16} />
                                {t("importing")}
                            </span>
                        ) : (
                            t("yesImport")
                        )}
                    </button>
                    <button className={popup.cancel} onClick={dismiss} disabled={isImporting}>
                        {t("no")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PopupImportFile;
