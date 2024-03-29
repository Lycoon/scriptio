import popup from "./Popup.module.css";
import form from "../utils/Form.module.css";

import CloseSVG from "@public/images/close.svg";
import { join } from "@src/lib/utils/misc";
import { PopupData, PopupImportFileData, closePopup } from "@src/lib/editor/popup";
import { useContext } from "react";
import { UserContext } from "@src/context/UserContext";

const PopupImportFile = ({ data: { confirmImport } }: PopupData<PopupImportFileData>) => {
    const userCtx = useContext(UserContext);

    const onConfirmImport = () => {
        confirmImport();
        closePopup(userCtx);
    };

    return (
        <div className={popup.window}>
            <div className={popup.container}>
                <div className={popup.header}>
                    <h2 className={popup.title}>Import screenplay</h2>
                    <CloseSVG className={popup.close_btn} onClick={() => closePopup(userCtx)} alt="Close icon" />
                </div>
                <div className={popup.info}>
                    <p>
                        Are you sure you want to import a screenplay? This will <b>overwrite</b> your current
                        screenplay. You can export your screenplay before importing a new one.
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
