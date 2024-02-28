import { UserContextType } from "@src/context/UserContext";
import { CharacterData } from "./characters";

// ------------------------------ //
//      SPECIFIC POPUP DATA       //
// ------------------------------ //
export type PopupImportFileData = {
    confirmImport: () => void;
};

export type PopupCharacterData = {
    character: CharacterData | undefined;
};

// ------------------------------ //
//         GENERIC POPUP          //
// ------------------------------ //
export type PopupUnionData = PopupImportFileData | PopupCharacterData;

export enum PopupType {
    NewCharacter,
    EditCharacter,
    ImportFile,
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
