"use client";

import { useContext } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { UserContext } from "@src/context/UserContext";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupConfirmFileBindData, PopupData, closePopup } from "@src/lib/screenplay/popup";

import popup from "./Popup.module.css";

/**
 * Stands between the user and a binding that would cost something.
 *
 * Two of the three cases have no "yes": another project in this library already
 * writes to that path (two writers over one file would clobber each other on
 * every save), or the OS refuses the location outright. The third — an existing
 * `.scriptio` belonging to a *different* document — is the user's to make, but
 * the system's own "replace?" prompt does not say that a project's file is about
 * to be destroyed, so it is said here, with the danger styling that goes with it.
 */
const PopupConfirmFileBind = ({ data: { refusal, confirm } }: PopupData<PopupConfirmFileBindData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.fileBind");

    const body = () => {
        switch (refusal.kind) {
            case "path-taken":
                return t("pathTaken", { project: refusal.title });
            case "replaces-foreign-file":
                return t("replacesForeignFile");
            case "not-writable":
                return t("notWritable", { message: refusal.message });
        }
    };

    const onConfirm = () => {
        closePopup(userCtx);
        confirm?.();
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
                    <p>{body()}</p>
                </div>
                <div className={popup.buttons}>
                    {confirm && (
                        <button className={popup.import_confirm} onClick={onConfirm}>
                            {t("replaceAnyway")}
                        </button>
                    )}
                    <button className={popup.cancel} onClick={() => closePopup(userCtx)}>
                        {confirm ? t("cancel") : t("ok")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PopupConfirmFileBind;
