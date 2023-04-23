import assert from "assert";
import { useState } from "react";
import {
    CharacterGender,
    doesCharacterExist,
    upsertCharacterData,
    deleteCharacter,
} from "../../src/lib/utils/characters";

type Props = {
    type: PopupType;
    character?: CharacterData;
    closePopup: () => void;
    getCharacterOccurrences?: (word: string) => number;
    replaceOccurrences?: (oldWord: string, newWord: string) => void;
};

export enum PopupType {
    NewCharacter,
    EditCharacter,
}

const PopupCharacterItem = ({
    closePopup,
    type,
    character,
    getCharacterOccurrences,
    replaceOccurrences,
}: Props) => {
    const [newNameWarning, setNewNameWarning] = useState<boolean>(false);
    const [takenNameError, setTakenNameError] = useState<boolean>(false);
    const [nameOccurrences, setNameOccurrences] = useState<number>(0);
    const [newName, setNewName] = useState<string>("");
    const [newGender, setNewGender] = useState<CharacterGender>(CharacterGender.Female);
    const [newSynopsis, setNewSynopsis] = useState<string>("");

    const onCreate = (e: any) => {
        e.preventDefault();

        const _name = e.target.name.value;
        const _gender = e.target.gender.value;
        const _synopsis = e.target.synopsis.value;

        const doesExist = doesCharacterExist(_name);
        if (doesExist) {
            return setTakenNameError(true);
        }

        upsertCharacterData(_name.toUpperCase(), {
            gender: _gender,
            synopsis: _synopsis,
        });

        closePopup();
    };

    const onEdit = (e: any) => {
        e.preventDefault();

        assert(character, "A character must be defined on edit mode");
        assert(getCharacterOccurrences);

        // need to store in local variables because stateful is async
        const _newName = e.target.name.value;
        const _newGender = +e.target.gender.value;
        const _newSynopsis = e.target.synopsis.value;

        setNewName(_newName.toUpperCase()); // to display it in popup UI
        setNewGender(_newGender);
        setNewSynopsis(_newSynopsis);

        if (_newName.toUpperCase() !== character.name) {
            const doesExist = doesCharacterExist(_newName);

            if (doesExist) {
                return setTakenNameError(true);
            }

            setNameOccurrences(getCharacterOccurrences(character.name));
            setNewNameWarning(true);
            return;
        }

        // if name is the same, just update the character
        upsertCharacterData(character.name, {
            gender: _newGender,
            synopsis: _newSynopsis,
        });

        closePopup();
    };

    const onNewNameConfirm = () => {
        assert(character, "A character must be defined on edit mode");
        assert(replaceOccurrences);

        // delete old character and insert with new name
        replaceOccurrences(character.name, newName);
        deleteCharacter(character.name);
        upsertCharacterData(newName, {
            gender: newGender,
            synopsis: newSynopsis,
        });

        closePopup();
    };

    let def: any = {
        title: "Create Character",
        onSubmit: onCreate,
        name: "",
        synopsis: "",
        gender: "",
    };

    if (type === PopupType.EditCharacter) {
        def.title = "Edit Character - " + character?.name;
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
                                Are you sure you want to update {nameOccurrences} occurrences of
                                word {character?.name} to {newName}? Take extra care of common words
                                whose update might be unwated.
                            </p>
                            <div className="popup-info-btns">
                                <button
                                    className="form-btn popup-info-btn"
                                    type="button"
                                    onClick={onNewNameConfirm}
                                >
                                    Yes
                                </button>
                                <button
                                    className="form-btn popup-info-btn"
                                    onClick={() => setNewNameWarning(false)}
                                >
                                    No, do not change
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
                                disabled={newNameWarning}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Gender</p>
                            <select
                                className="select-form popup-select"
                                name="gender"
                                defaultValue={def.gender}
                                disabled={newNameWarning || takenNameError}
                            >
                                <option value="0">Female</option>
                                <option value="1">Male</option>
                                <option value="2">Other</option>
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
                            disabled={newNameWarning || takenNameError}
                        />
                    </div>
                    <button
                        disabled={newNameWarning || takenNameError}
                        className="form-btn popup-confirm"
                        type="submit"
                    >
                        Confirm
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PopupCharacterItem;
