import assert from "assert";
import { useContext, useState } from "react";
import { CharacterGender, doesCharacterExist, upsertCharacterData, deleteCharacter } from "@src/lib/editor/characters";

import CloseSVG from "@public/images/close.svg";

import form from "../utils/Form.module.css";
import form_info from "../utils/FormInfo.module.css";
import settings from "../settings/SettingsPageContainer.module.css";
import popup from "./Popup.module.css";
import { join } from "@src/lib/utils/misc";
import { ProjectContext } from "@src/context/ProjectContext";
import { SaveStatus } from "@src/lib/utils/enums";
import { replaceOccurrences } from "@src/lib/editor/editor";
import { UserContext } from "@src/context/UserContext";
import { PopupCharacterData, PopupData, PopupType, closePopup } from "@src/lib/editor/popup";
import { countOccurrences } from "@src/lib/editor/screenplay";

type NewNameWarningProps = {
    setNewNameWarning: (value: boolean) => void;
    onNewNameConfirm: () => void;
    nameOccurrences: number;
    oldName: string;
    newName: string;
};

const NewNameWarning = (props: NewNameWarningProps) => {
    return (
        <div className={join(popup.info, form_info.warn)}>
            <p>
                Are you sure you want to update {props.nameOccurrences} occurrences of word {props.oldName} to{" "}
                {props.newName}? Take extra care of common words whose update might be unwated.
            </p>
            <div className={popup.info_btns}>
                <button className={join(form.btn, popup.info_btn)} type="button" onClick={props.onNewNameConfirm}>
                    Yes
                </button>
                <button className={join(form.btn, popup.info_btn)} onClick={() => props.setNewNameWarning(false)}>
                    No, do not change
                </button>
            </div>
        </div>
    );
};

const TakenNameError = (newName: string) => {
    return (
        <div className={join(popup.info, form_info.error)}>
            <p>
                A character with the name {newName} already exists. Please choose a different name or edit the existing
                character instead.
            </p>
        </div>
    );
};

export const PopupCharacterItem = ({ type, data: { character } }: PopupData<PopupCharacterData>) => {
    const projectCtx = useContext(ProjectContext);
    const userCtx = useContext(UserContext);

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

        const doesExist = doesCharacterExist(_name, projectCtx);
        if (doesExist) {
            return setTakenNameError(true);
        }

        projectCtx.updateSaveStatus(SaveStatus.Saving);
        upsertCharacterData(
            {
                name: _name.toUpperCase(),
                gender: _gender,
                synopsis: _synopsis,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    const onEdit = (e: any) => {
        e.preventDefault();

        assert(character, "A character must be defined on edit mode");

        // need to store in local variables because stateful is async
        const _newName = e.target.name.value;
        const _newGender = +e.target.gender.value;
        const _newSynopsis = e.target.synopsis.value;

        setNewName(_newName.toUpperCase()); // to display it in popup UI
        setNewGender(_newGender);
        setNewSynopsis(_newSynopsis);

        if (_newName.toUpperCase() !== character.name) {
            const doesExist = doesCharacterExist(_newName, projectCtx);

            if (doesExist) {
                return setTakenNameError(true);
            }

            setNameOccurrences(countOccurrences(projectCtx.screenplayEditor?.getJSON()!, character.name));
            setNewNameWarning(true);
            return;
        }

        // if name is the same, just update the character
        projectCtx.updateSaveStatus(SaveStatus.Saving);
        upsertCharacterData(
            {
                name: character.name,
                gender: _newGender,
                synopsis: _newSynopsis,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    const onNewNameConfirm = () => {
        assert(character, "A character must be defined on edit mode");

        // delete old character and insert with new name
        replaceOccurrences(projectCtx.screenplayEditor!, character.name, newName);
        deleteCharacter(character.name, projectCtx);

        projectCtx.updateSaveStatus(SaveStatus.Saving);
        upsertCharacterData(
            {
                name: newName,
                gender: newGender,
                synopsis: newSynopsis,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
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
        <div className={popup.window}>
            <div className={popup.container}>
                <div className={popup.header}>
                    <h2 className={popup.title}>{def.title}</h2>
                    <CloseSVG className={popup.close_btn} onClick={() => closePopup(userCtx)} alt="Close icon" />
                </div>
                <form className={popup.form} onSubmit={def.onSubmit}>
                    {takenNameError && TakenNameError(newName)}
                    {newNameWarning &&
                        NewNameWarning({
                            setNewNameWarning,
                            onNewNameConfirm,
                            nameOccurrences,
                            oldName: character?.name!,
                            newName,
                        })}
                    <div className={settings.element}>
                        <div className={settings.element_header}>
                            <p>Name</p>
                            <input
                                className={join(form.input, popup.input)}
                                name="name"
                                required
                                defaultValue={def.name}
                                onChange={() => setTakenNameError(false)}
                                disabled={newNameWarning}
                            />
                        </div>
                    </div>
                    <div className={settings.element}>
                        <div className={settings.element_header}>
                            <p>Gender</p>
                            <select
                                className={join(settings.select_form, popup.select)}
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
                    <div className={settings.element}>
                        <p>Synopsis</p>
                        <textarea
                            className={join(form.input, popup.textarea)}
                            name="synopsis"
                            defaultValue={def.synopsis}
                            disabled={newNameWarning || takenNameError}
                        />
                    </div>
                    <button
                        disabled={newNameWarning || takenNameError}
                        className={join(form.btn, popup.confirm)}
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
