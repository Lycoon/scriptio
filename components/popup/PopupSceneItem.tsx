"use client";

import { useContext, useState } from "react";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { PopupData, PopupSceneData, closePopup } from "@src/lib/screenplay/popup";
import { upsertSceneData, deleteScenePersistence } from "@src/lib/screenplay/scenes";
import { v4 as uuidv4 } from "uuid";

import CloseSVG from "@public/images/close.svg";

import form from "@components/utils/Form.module.css";
import styles from "@components/popup/PopupCharacterItem.module.css";
import popup from "@components/popup/Popup.module.css";

export const PopupSceneItem = ({ data: { scene } }: PopupData<PopupSceneData>) => {
    const projectCtx = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();

    const [synopsis, setSynopsis] = useState<string>(scene.synopsis || "");
    const [color, setColor] = useState<string>(scene.color || "#808080");

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        upsertSceneData(
            {
                title: scene.title,
                position: scene.position,
                id: scene.id || uuidv4(),
                synopsis,
                color: color !== "#808080" ? color : undefined,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    const onDelete = () => {
        deleteScenePersistence(scene.title, scene.position, projectCtx);
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
                    <h2 className={popup.title}>Edit Scene</h2>
                    <CloseSVG className={popup.close_btn} onClick={() => closePopup(userCtx)} alt="Close icon" />
                </div>
                <form className={popup.form} onSubmit={onSubmit}>
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>Scene</p>
                            <input className={join(form.input, popup.input)} value={scene.title} disabled />
                        </div>
                    </div>
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>Color</p>
                            <input
                                type="color"
                                className={popup.input}
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                style={{ cursor: "pointer", padding: 0 }}
                            />
                        </div>
                        <hr />
                    </div>
                    <div className={styles.element}>
                        <p>Synopsis</p>
                        <textarea
                            className={join(form.input, popup.textarea)}
                            value={synopsis}
                            onChange={(e) => setSynopsis(e.target.value)}
                            placeholder="Write a brief description of this scene..."
                        />
                    </div>
                    <button className={join(form.btn, popup.confirm)} type="submit">
                        Save
                    </button>
                    {scene.isPersistent && (
                        <button type="button" className={join(form.btn, popup.cancel)} onClick={onDelete}>
                            Remove Metadata
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default PopupSceneItem;
