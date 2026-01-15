"use client";

import popup from "./Popup.module.css";
import form from "../utils/Form.module.css";

import CloseSVG from "@public/images/close.svg";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { PopupData, PopupImportFileData, closePopup } from "@src/lib/screenplay/popup";
import { useContext } from "react";
import { UserContext } from "@src/context/UserContext";

const PopupImportFile = ({ data: { confirmImport } }: PopupData<PopupImportFileData>) => {
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();

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
                    <h2 className={popup.title}>Confirm Import</h2>
                    <CloseSVG className={popup.close_btn} onClick={() => closePopup(userCtx)} alt="Close icon" />
                </div>
                <div className={popup.info}>
                    <p>
                        Are you sure you want to <b>overwrite</b> your current project?
                        <br />
                        You can export your project before importing a new one.
                    </p>
                </div>
                <button className={join(form.btn, popup.confirm, popup.import_confirm)} onClick={onConfirmImport}>
                    Yes, import
                </button>
                <button className={join(form.btn, popup.cancel)} onClick={() => closePopup(userCtx)}>
                    No
                </button>
            </div>
        </div>
    );
};

export default PopupImportFile;
