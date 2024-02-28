import { UserContext } from "@src/context/UserContext";
import { PopupCharacterData, PopupData, PopupImportFileData, PopupType } from "@src/lib/editor/popup";
import { useContext } from "react";
import PopupCharacterItem from "./PopupCharacterItem";
import PopupImportFile from "./PopupImportFile";

export const Popup = () => {
    const { popup } = useContext(UserContext);
    if (!popup) return null;

    switch (popup.type) {
        case PopupType.NewCharacter:
            return PopupCharacterItem(popup as PopupData<PopupCharacterData>);
        case PopupType.EditCharacter:
            return PopupCharacterItem(popup as PopupData<PopupCharacterData>);
        case PopupType.ImportFile:
            return PopupImportFile(popup as PopupData<PopupImportFileData>);
    }
};
