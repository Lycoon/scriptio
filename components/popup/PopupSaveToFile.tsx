"use client";

import { useContext } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { UserContext } from "@src/context/UserContext";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupSaveToFileData, closePopup } from "@src/lib/screenplay/popup";

import popup from "./Popup.module.css";

/**
 * ⌘S on a project that has no file yet.
 *
 * The point of the copy is to answer the question the shortcut raises rather
 * than the one it asks: the work is *already* saved, so pressing Save cannot be
 * about safety. Saying that first makes the offer below it read as what it is —
 * a copy of your own to keep and to share — instead of implying the user has
 * been running unsaved this whole time.
 */
const PopupSaveToFile = ({ data: { confirmSave } }: PopupData<PopupSaveToFileData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.saveToFile");

    const onConfirm = () => {
        closePopup(userCtx);
        confirmSave();
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
                    <p>{t("reassurance")}</p>
                    <p>{t("offer")}</p>
                </div>
                <div className={popup.buttons}>
                    <button className={popup.confirm} onClick={onConfirm}>
                        {t("confirm")}
                    </button>
                    <button className={popup.cancel} onClick={() => closePopup(userCtx)}>
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PopupSaveToFile;
