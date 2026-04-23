"use client";

import { useContext, useState } from "react";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { PopupData, PopupSceneData, closePopup } from "@src/lib/screenplay/popup";
import { ColorPicker } from "@components/utils/ColorPicker";
import { useTranslations } from "next-intl";
import { Save, X } from "lucide-react";

import form from "@components/utils/Form.module.css";
import styles from "@components/popup/PopupCharacterItem.module.css";
import popup from "@components/popup/Popup.module.css";

export const PopupSceneItem = ({ data: { scene } }: PopupData<PopupSceneData>) => {
    const { repository } = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.scene");

    const [synopsis, setSynopsis] = useState<string>(scene.synopsis || "");
    const [color, setColor] = useState<string | undefined>(scene.color);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!repository) {
            console.warn("[PopupSceneItem] Repository not available");
            return;
        }

        if (!scene.id) {
            console.warn("[PopupSceneItem] Scene id is not available on this node.");
            return;
        }

        repository.upsertScene(scene.id, { synopsis, color });
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
                    <h2 className={popup.title}>{t("edit")}</h2>
                    <X className={popup.close_btn} onClick={() => closePopup(userCtx)} />
                </div>
                <form className={popup.form} onSubmit={onSubmit}>
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>{t("sceneTitle")}</p>
                            <input className={join(form.input, popup.input)} value={scene.title} disabled />
                        </div>
                    </div>
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>{t("color")}</p>
                            <ColorPicker value={color} onChange={setColor} />
                        </div>
                        <hr />
                    </div>
                    <div className={styles.element}>
                        <p>{t("synopsis")}</p>
                        <textarea
                            className={join(form.input, popup.textarea)}
                            value={synopsis}
                            onChange={(e) => setSynopsis(e.target.value)}
                            placeholder={t("synopsisPlaceholder")}
                        />
                    </div>
                    <button className={join(form.btn, popup.confirm)} type="submit">
                        <Save size={18} />
                        {t("save")}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PopupSceneItem;