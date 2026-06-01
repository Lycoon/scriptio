"use client";

import { UserContext } from "@src/context/UserContext";
import {
    PopupCharacterData,
    PopupData,
    PopupImportFileData,
    PopupSceneData,
    PopupType,
    PopupUnlockDraftData,
    PopupUnlockPagesData,
    PopupUnlockScenesData,
    PopupUploadToCloudData,
} from "@src/lib/screenplay/popup";
import { useContext } from "react";
import PopupCharacterItem from "./PopupCharacterItem";
import PopupImportFile from "./PopupImportFile";
import PopupSceneItem from "./PopupSceneItem";
import PopupUnlockDraft from "./PopupUnlockDraft";
import PopupUnlockPages from "./PopupUnlockPages";
import PopupUnlockScenes from "./PopupUnlockScenes";
import PopupUploadToCloud from "./PopupUploadToCloud";

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
        case PopupType.UploadToCloud:
            return <PopupUploadToCloud {...(popup as PopupData<PopupUploadToCloudData>)} />;
        case PopupType.UnlockScenes:
            return <PopupUnlockScenes {...(popup as PopupData<PopupUnlockScenesData>)} />;
        case PopupType.UnlockPages:
            return <PopupUnlockPages {...(popup as PopupData<PopupUnlockPagesData>)} />;
        case PopupType.UnlockDraft:
            return <PopupUnlockDraft {...(popup as PopupData<PopupUnlockDraftData>)} />;
        default:
            return null;
    }
};
