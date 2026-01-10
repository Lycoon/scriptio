"use client";

import { UserContext } from "@src/context/UserContext";
import {
    PopupCharacterData,
    PopupData,
    PopupImportFileData,
    PopupSceneData,
    PopupType,
} from "@src/lib/screenplay/popup";
import { useContext } from "react";
import PopupCharacterItem from "./PopupCharacterItem";
import PopupImportFile from "./PopupImportFile";
import PopupSceneItem from "./PopupSceneItem";

export const Popup = () => {
    const { popup } = useContext(UserContext);

    if (!popup) return null;

    switch (popup.type) {
        case PopupType.NewCharacter:
        case PopupType.EditCharacter:
            return <PopupCharacterItem {...(popup as PopupData<PopupCharacterData>)} />;
        case PopupType.ImportFile:
            return <PopupImportFile {...(popup as PopupData<PopupImportFileData>)} />;
        case PopupType.EditScene:
            return <PopupSceneItem {...(popup as PopupData<PopupSceneData>)} />;
        default:
            return null;
    }
};
