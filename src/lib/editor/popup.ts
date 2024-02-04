import PopupCharacterItem, { PopupType } from "@components/popup/PopupCharacterItem";
import { UserContextType } from "@src/context/UserContext";

export const editCharacterPopup = (userCtx: UserContextType, character: CharacterData) => {
    userCtx.updatePopup(() => <PopupCharacterItem />);
};

export const addCharacterPopup = (userCtx: UserContextType) => {
    userCtx.updatePopup(() => <PopupCharacterItem closePopup={closePopup} type={PopupType.NewCharacter} />);
};

export const closePopup = (userCtx: UserContextType) => {
    userCtx.updatePopup(undefined);
};
