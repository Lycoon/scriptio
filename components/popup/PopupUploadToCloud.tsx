"use client";

import popup from "./Popup.module.css";
import form from "../utils/Form.module.css";

import { X } from "lucide-react";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupUploadToCloudData, closePopup } from "@src/lib/screenplay/popup";
import { useContext, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useTranslations } from "next-intl";
import FormInfo, { FormInfoType } from "../utils/FormInfo";

const PopupUploadToCloud = ({ data: { projectId } }: PopupData<PopupUploadToCloudData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.uploadToCloud");

    const [isUploading, setIsUploading] = useState(false);
    const [info, setInfo] = useState<FormInfoType | undefined>(undefined);

    const onConfirm = async () => {
        if (isUploading) return;
        setIsUploading(true);
        setInfo(undefined);
        try {
            const { promoteLocalProjectToCloud } = await import(
                "@src/lib/persistence/storage-provider/local-persistence"
            );
            await promoteLocalProjectToCloud(projectId);
            window.location.reload();
        } catch (e) {
            const message = e instanceof Error ? e.message : t("failed");
            setInfo({ content: message, isError: true });
            setIsUploading(false);
        }
    };

    const onCancel = () => {
        if (isUploading) return;
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
                    <X className={popup.close_btn} onClick={onCancel} />
                </div>
                <div className={popup.info}>
                    <p>{t("body")}</p>
                </div>
                {info && <FormInfo info={info} />}
                <button
                    className={join(form.btn, popup.confirm)}
                    onClick={onConfirm}
                    disabled={isUploading}
                >
                    {isUploading ? t("uploading") : t("confirm")}
                </button>
                <button
                    className={join(form.btn, popup.cancel)}
                    onClick={onCancel}
                    disabled={isUploading}
                >
                    {t("cancel")}
                </button>
            </div>
        </div>
    );
};

export default PopupUploadToCloud;
