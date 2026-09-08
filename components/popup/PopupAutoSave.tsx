"use client";

import { useContext } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { UserContext } from "@src/context/UserContext";
import { useDraggable } from "@src/lib/utils/hooks";
import { fileNameOf } from "@src/lib/persistence/file-binding";
import { PopupAutoSaveData, PopupData, closePopup } from "@src/lib/screenplay/popup";

import popup from "./Popup.module.css";

/**
 * ⌘S on a project that already has a file.
 *
 * The shortcut is a reflex, and the reflex is about safety — so the answer is
 * the reassurance, named: *this* file, the one you chose, is already current and
 * stays that way. Saying it plainly is the only way the habit ever relaxes; a
 * silent no-op would just teach the user to press it harder.
 */
const PopupAutoSave = ({ data: { path } }: PopupData<PopupAutoSaveData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.autoSave");

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
                    <p title={path}>{t("body", { file: fileNameOf(path) })}</p>
                    <p>{t("hint")}</p>
                </div>
                <div className={popup.buttons}>
                    <button className={popup.confirm} onClick={() => closePopup(userCtx)}>
                        {t("ok")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PopupAutoSave;
