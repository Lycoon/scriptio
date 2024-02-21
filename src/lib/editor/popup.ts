import { UserContextType } from "@src/context/UserContext";
import { CharacterData } from "./characters";

export enum PopupType {
    NewCharacter,
    EditCharacter,
    ImportFile,
}

export const closePopup = (userCtx: UserContextType) => {
    userCtx.updatePopup(undefined);
};

export const editCharacterPopup = (character: CharacterData, userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.EditCharacter,
        character,
    });
};

export const addCharacterPopup = (userCtx: UserContextType) => {
    userCtx.updatePopup({
        type: PopupType.NewCharacter,
    });
};

export const importFilePopup = (userCtx: UserContextType, confirmImport: () => void) => {
    // <PopupImportFile></PopupImportFile>
    userCtx.updatePopup({
        type: PopupType.ImportFile,
    });
};
