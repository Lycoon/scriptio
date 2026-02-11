"use client";

import { useContext, useState } from "react";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { PopupData, PopupSceneData, closePopup } from "@src/lib/screenplay/popup";
import { generateSceneId } from "@src/lib/screenplay/scenes";
import { ColorPicker } from "@components/utils/ColorPicker";
import { ScreenplayElement } from "@src/lib/utils/enums";

import CloseSVG from "@public/images/close.svg";

import form from "@components/utils/Form.module.css";
import styles from "@components/popup/PopupCharacterItem.module.css";
import popup from "@components/popup/Popup.module.css";

export const PopupSceneItem = ({ data: { scene } }: PopupData<PopupSceneData>) => {
    const { repository, editor } = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();

    const [synopsis, setSynopsis] = useState<string>(scene.synopsis || "");
    const [color, setColor] = useState<string | undefined>(scene.color);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!repository) {
            console.warn("[PopupSceneItem] Repository not available");
            return;
        }

        // If scene already has an id, update it; otherwise create a new persistent scene
        const isNewPersistentScene = !scene.id;
        const sceneId = scene.id || generateSceneId();
        repository.upsertScene(sceneId, { synopsis, color });

        // If this is a new persistent scene, update the scene heading node with the scene-id
        if (isNewPersistentScene && editor) {
            // Find and update the scene node at the given position
            const { doc, tr } = editor.state;
            const resolvedPos = doc.resolve(scene.position);
            const nodeAtPos = resolvedPos.parent;

            // Verify we're at a scene node
            if (nodeAtPos.type.name === ScreenplayElement.Scene) {
                const nodeStart = resolvedPos.before();
                tr.setNodeMarkup(nodeStart, undefined, {
                    ...nodeAtPos.attrs,
                    "scene-id": sceneId,
                });
                editor.view.dispatch(tr);
            }
        }

        closePopup(userCtx);
    };

    const onDelete = () => {
        if (!repository || !scene.id) {
            closePopup(userCtx);
            return;
        }

        // Remove the scene-id attribute from the editor node
        if (editor) {
            const { doc, tr } = editor.state;
            const resolvedPos = doc.resolve(scene.position);
            const nodeAtPos = resolvedPos.parent;

            if (nodeAtPos.type.name === ScreenplayElement.Scene) {
                const nodeStart = resolvedPos.before();
                const { "scene-id": _, ...attrsWithoutSceneId } = nodeAtPos.attrs;
                tr.setNodeMarkup(nodeStart, undefined, attrsWithoutSceneId);
                editor.view.dispatch(tr);
            }
        }

        repository.deleteScene(scene.id);
        closePopup(userCtx);
    };

    const isPersistent = !!scene.id;

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
                            <ColorPicker value={color} onChange={setColor} />
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
                </form>
            </div>
        </div>
    );
};

export default PopupSceneItem;
