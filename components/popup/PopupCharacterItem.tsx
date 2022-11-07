import { useState } from "react";
import { CharacterData, CharacterGender, doesCharacterExist } from "../../src/lib/screenplayUtils";

type Props = {
    type: PopupType;
    character?: CharacterData;
    closePopup: () => void;
};

export enum PopupType {
    NewCharacter,
    EditCharacter,
}

const PopupCharacterItem = ({ closePopup, type, character }: Props) => {
    const [newNameWarning, setNewNameWarning] = useState<boolean>(false);
    const [takenNameError, setTakenNameError] = useState<boolean>(false);
    const [newName, setNewName] = useState<string>("");

    const onCreate = (e: any) => {
        const _newName = e.target.name.value;
        e.preventDefault();
    };

    const onEdit = (e: any) => {
        e.preventDefault();

        const _newName = e.target.name.value;
        setNewName(_newName);

        const newGender = e.target.gender.value;
        const newSynopsis = e.target.synopsis.value;

        if (_newName !== character?.name) {
            const doesExist = doesCharacterExist(_newName);
            if (doesExist) {
                console.log(_newName);
                return setTakenNameError(true);
            }

            setNewNameWarning(true);
        }
    };

    const onNewNameConfirm = () => {};

    let def: any = {
        title: "Create Character",
        onSubmit: onCreate,
        name: "",
        synopsis: "",
        gender: "",
    };

    if (type === PopupType.EditCharacter) {
        def.title = "Edit Character";
        def.onSubmit = onEdit;
        def.name = character?.name;
        def.synopsis = character?.synopsis;
        def.gender = character?.gender;
    }

    return (
        <div className="popup-container">
            <div className="popup">
                <div className="popup-header">
                    <h2 className="popup-title">{def.title}</h2>
                    <div className="settings-btn" onClick={closePopup}>
                        <img className="settings-icon" src="/images/close.png" />
                    </div>
                </div>
                <form className="popup-form" onSubmit={def.onSubmit}>
                    {newNameWarning && (
                        <div className="form-info-warn popup-info">
                            <p>
                                Are you sure you want to update 49 occurrences of word{" "}
                                {character?.name} to {newName}? Take extra care of common words
                                whose update might be unwated.
                            </p>
                            <div className="popup-info-btns">
                                <button
                                    className="form-btn popup-info-btn"
                                    onClick={onNewNameConfirm}
                                >
                                    Yes
                                </button>
                                <button
                                    className="form-btn popup-info-btn"
                                    onClick={() => setNewNameWarning(false)}
                                >
                                    No, don't change
                                </button>
                            </div>
                        </div>
                    )}
                    {takenNameError && (
                        <div className="form-info-error popup-info">
                            <p>
                                A character with the name {newName} already exists. Please choose a
                                different name or edit the existing character instead.
                            </p>
                        </div>
                    )}
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Name</p>
                            <input
                                className="form-input popup-input"
                                name="name"
                                required
                                defaultValue={def.name}
                                onChange={() => setTakenNameError(false)}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Gender</p>
                            <select className="select-form popup-select" name="gender">
                                <option value="f">Female</option>
                                <option value="m">Male</option>
                                <option value="o">Other</option>
                            </select>
                        </div>
                        <hr />
                    </div>
                    <div className="settings-element">
                        <p>Synopsis</p>
                        <textarea
                            className="form-input popup-textarea"
                            name="synopsis"
                            defaultValue={def.synopsis}
                        />
                    </div>
                    <button className="form-btn popup-confirm" type="submit">
                        Confirm
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PopupCharacterItem;
