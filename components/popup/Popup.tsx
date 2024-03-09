import { UserContext } from "@src/context/UserContext";
import { PopupCharacterData, PopupData, PopupImportFileData, PopupType } from "@src/lib/editor/popup";
import { useContext } from "react";
import PopupCharacterItem from "./PopupCharacterItem";
import PopupImportFile from "./PopupImportFile";

export const Popup = () => {
    const { popup } = useContext(UserContext);

    if (!popup) return null;

    let popupToRender;
    switch (popup.type) {
        case PopupType.NewCharacter:
            popupToRender = PopupCharacterItem(popup as PopupData<PopupCharacterData>);
            break;
        case PopupType.EditCharacter:
            popupToRender = PopupCharacterItem(popup as PopupData<PopupCharacterData>);
            break;
        case PopupType.ImportFile:
            popupToRender = PopupImportFile(popup as PopupData<PopupImportFileData>);
            break;
    }

    return <> {popupToRender} </>;
};
