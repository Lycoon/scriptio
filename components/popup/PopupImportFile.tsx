"use client";

import popup from "./Popup.module.css";

import { X } from "lucide-react";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupImportFileData, closePopup } from "@src/lib/screenplay/popup";
import { useContext } from "react";
import { UserContext } from "@src/context/UserContext";
import { useTranslations } from "next-intl";

const PopupImportFile = ({ data: { confirmImport } }: PopupData<PopupImportFileData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.import");

    const onConfirmImport = () => {
        confirmImport();
        closePopup(userCtx);
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
                    <X className={popup.close_btn} onClick={() => closePopup(userCtx)} />
                </div>
                <div className={popup.info}>
                    <p>
                        {t.rich("warning", { b: (chunks) => <b>{chunks}</b> })}
                        <br />
                        {t("info")}
                    </p>
                </div>
                <button className={popup.import_confirm} onClick={onConfirmImport}>
                    {t("yesImport")}
                </button>
                <button className={popup.cancel} onClick={() => closePopup(userCtx)}>
                    {t("no")}
                </button>
            </div>
        </div>
    );
};

export default PopupImportFile;
