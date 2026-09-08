import { UserContextType } from "@src/context/UserContext";
import type { BindRefusal } from "@src/lib/persistence/file-binding";
import { CharacterData } from "./characters";
import { Scene } from "./scenes";

// ------------------------------ //
//      SPECIFIC POPUP DATA       //
// ------------------------------ //
export type PopupImportFileData = {
    confirmImport: () => void | Promise<void>;
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

export type PopupUnlockPagesData = {
    confirmUnlock: () => void;
};

export type PopupUnlockDraftData = {
    confirmUnlock: () => void;
};

/**
 * Binding a project to a file has a cost the OS "replace?" prompt does not
 * mention, or is outright impossible. `confirm` is null for the cases the user
 * cannot proceed through — the dialog then just explains and dismisses.
 */
export type PopupConfirmFileBindData = {
    refusal: BindRefusal;
    confirm: (() => void) | null;
};

/** ⌘S on a project with no file yet: explain, then offer to pick a path. */
export type PopupSaveToFileData = {
    confirmSave: () => void;
};

/** ⌘S on a project already bound to a file: say that the file keeps itself current. */
export type PopupAutoSaveData = {
    path: string;
};

// ------------------------------ //
//         GENERIC POPUP          //
// ------------------------------ //
export type PopupUnionData =
    | PopupImportFileData
    | PopupCharacterData
    | PopupSceneData
    | PopupUploadToCloudData
    | PopupUnlockScenesData
    | PopupUnlockPagesData
    | PopupUnlockDraftData
    | PopupConfirmFileBindData
    | PopupSaveToFileData
    | PopupAutoSaveData;

export enum PopupType {
    NewCharacter,
    EditCharacter,
    ImportFile,
    EditScene,
    UploadToCloud,
    UnlockScenes,
    UnlockPages,
    UnlockDraft,
    ConfirmFileBind,
    SaveToFile,
    AutoSave,
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

export const unlockPagesPopup = (confirmUnlock: () => void, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.UnlockPages,
        data: { confirmUnlock },
    });
};

export const unlockDraftPopup = (confirmUnlock: () => void, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.UnlockDraft,
        data: { confirmUnlock },
    });
};

export const confirmFileBindPopup = (
    userCtx: UserContextType,
    refusal: BindRefusal,
    confirm: (() => void) | null,
) => {
    userCtx.updatePopup({
        type: PopupType.ConfirmFileBind,
        data: { refusal, confirm },
    });
};

export const saveToFilePopup = (userCtx: UserContextType, confirmSave: () => void) => {
    userCtx.updatePopup({
        type: PopupType.SaveToFile,
        data: { confirmSave },
    });
};

export const autoSavePopup = (userCtx: UserContextType, path: string) => {
    userCtx.updatePopup({
        type: PopupType.AutoSave,
        data: { path },
    });
};
