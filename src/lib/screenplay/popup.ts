import { UserContextType } from "@src/context/UserContext";
import { CharacterData } from "./characters";
import { Scene } from "./scenes";

// ------------------------------ //
//      SPECIFIC POPUP DATA       //
// ------------------------------ //
export type PopupImportFileData = {
    confirmImport: () => void;
};

export type PopupCharacterData = {
    character: CharacterData | undefined;
};

export type PopupSceneData = {
    scene: Scene;
};

export type PopupUploadToCloudData = {
    projectId: string;
};

export type PopupUnlockScenesData = {
    confirmUnlock: () => void;
};

// ------------------------------ //
//         GENERIC POPUP          //
// ------------------------------ //
export type PopupUnionData =
    | PopupImportFileData
    | PopupCharacterData
    | PopupSceneData
    | PopupUploadToCloudData
    | PopupUnlockScenesData;

export enum PopupType {
    NewCharacter,
    EditCharacter,
    ImportFile,
    EditScene,
    UploadToCloud,
    UnlockScenes,
}

export type PopupData<DataType extends PopupUnionData> = {
    type: PopupType;
    data: DataType;
};

// ------------------------------ //
//         POPUP FUNCTIONS        //
// ------------------------------ //
export const closePopup = (userCtx: UserContextType) => {
    userCtx.updatePopup(undefined);
};

export const editCharacterPopup = (character: CharacterData, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.EditCharacter,
        data: { character },
    });
};

export const addCharacterPopup = (userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.NewCharacter,
        data: { character: undefined },
    });
};

export const importFilePopup = (userCtx: UserContextType, confirmImport: () => void) => {
    // <PopupImportFile></PopupImportFile>
    userCtx.updatePopup({
        type: PopupType.ImportFile,
        data: { confirmImport },
    });
};

export const editScenePopup = (scene: Scene, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.EditScene,
        data: { scene },
    });
};

export const uploadToCloudPopup = (projectId: string, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.UploadToCloud,
        data: { projectId },
    });
};

export const unlockScenesPopup = (confirmUnlock: () => void, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.UnlockScenes,
        data: { confirmUnlock },
    });
};
