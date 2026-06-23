"use client";

import { useContext } from "react";
import { useTranslations } from "next-intl";
import { X, Unlock } from "lucide-react";

import popup from "./Popup.module.css";

import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupUnlockDraftData, closePopup } from "@src/lib/screenplay/popup";
import { UserContext } from "@src/context/UserContext";

const PopupUnlockDraft = ({ data: { confirmUnlock } }: PopupData<PopupUnlockDraftData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("production");

    const onConfirm = () => {
        confirmUnlock();
        closePopup(userCtx);
    };

    return (
        <div className={popup.window}>
            <div
                className={popup.container}
                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
            >
                <div
                    className={popup.header}
                    onMouseDown={handleMouseDown}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                    <h2 className={popup.title}>{t("unlockDraftTitle")}</h2>
                    <X className={popup.close_btn} onClick={() => closePopup(userCtx)} />
                </div>
                <div className={popup.info}>
                    <p>{t("unlockDraftWarning")}</p>
                </div>
                <div className={popup.buttons}>
                    <button className={popup.import_confirm} onClick={onConfirm}>
                        <Unlock size={18} color="white" />
                        {t("unlockDraft")}
                    </button>
                    <button className={popup.cancel} onClick={() => closePopup(userCtx)}>
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PopupUnlockDraft;
