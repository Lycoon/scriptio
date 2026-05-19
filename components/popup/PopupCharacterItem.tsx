"use client";

import assert from "assert";
import { useContext, useState, type FormEvent } from "react";
import {
    CharacterGender,
    doesCharacterExist,
    upsertCharacterData,
    renameCharacter,
} from "@src/lib/screenplay/characters";
import { join } from "@src/lib/utils/misc";
import { useDraggable } from "@src/lib/utils/hooks";
import { ProjectContext } from "@src/context/ProjectContext";
import { replaceOccurrences } from "@src/lib/screenplay/editor";
import { UserContext } from "@src/context/UserContext";
import { PopupCharacterData, PopupData, PopupType, closePopup } from "@src/lib/screenplay/popup";
import { countOccurrences } from "@src/lib/screenplay/screenplay";
import { ColorPicker } from "@components/utils/ColorPicker";
import { useTranslations } from "next-intl";

import { X } from "lucide-react";

import form from "@components/utils/Form.module.css";
import form_info from "@components/utils/FormInfo.module.css";
import styles from "@components/popup/PopupCharacterItem.module.css";
import popup from "@components/popup/Popup.module.css";

type TFunction = ReturnType<typeof useTranslations>;

type NewNameWarningProps = {
    setNewNameWarning: (value: boolean) => void;
    onNewNameConfirm: () => void;
    nameOccurrences: number;
    oldName: string;
    newName: string;
    t: TFunction;
};

const NewNameWarning = (props: NewNameWarningProps) => {
    return (
        <div className={join(popup.info, form_info.warn)}>
            <p>
                {props.t("updateOccurrences", { count: props.nameOccurrences, oldName: props.oldName, newName: props.newName })}
            </p>
            <div className={popup.info_btns}>
                <button className={join(form.btn, popup.info_btn)} type="button" onClick={props.onNewNameConfirm}>
                    {props.t("yes")}
                </button>
                <button className={join(form.btn, popup.info_btn)} onClick={() => props.setNewNameWarning(false)}>
                    {props.t("noDoNotChange")}
                </button>
            </div>
        </div>
    );
};

const TakenNameError = (newName: string, t: TFunction) => {
    return (
        <div className={join(popup.info, form_info.error)}>
            <p>
                {t("takenNameError", { newName })}
            </p>
        </div>
    );
};

export const PopupCharacterItem = ({ type, data: { character } }: PopupData<PopupCharacterData>) => {
    const projectCtx = useContext(ProjectContext);
    const userCtx = useContext(UserContext);
    const { position, handleMouseDown, isDragging } = useDraggable();
    const t = useTranslations("popup.character");

    const [newNameWarning, setNewNameWarning] = useState<boolean>(false);
    const [takenNameError, setTakenNameError] = useState<boolean>(false);
    const [nameOccurrences, setNameOccurrences] = useState<number>(0);

    const [newName, setNewName] = useState<string>("");
    const [newGender, setNewGender] = useState<CharacterGender>(CharacterGender.FEMALE);
    const [newSynopsis, setNewSynopsis] = useState<string>("");
    const [newColor, setNewColor] = useState<string | undefined>(character?.color);

    const onCreate = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget as typeof e.currentTarget & {
            name: HTMLInputElement;
            gender: HTMLSelectElement;
            synopsis: HTMLTextAreaElement;
        };
        const _name = form.name.value;
        const _gender = +form.gender.value as CharacterGender;
        const _synopsis = form.synopsis.value;

        const doesExist = doesCharacterExist(_name, projectCtx);
        if (doesExist) {
            return setTakenNameError(true);
        }

        upsertCharacterData(
            {
                name: _name.toUpperCase(),
                gender: _gender,
                synopsis: _synopsis,
                color: newColor,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    const onEdit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        assert(character, "A character must be defined on edit mode");

        const form = e.currentTarget as typeof e.currentTarget & {
            name: HTMLInputElement;
            gender: HTMLSelectElement;
            synopsis: HTMLTextAreaElement;
        };
        const _newName = form.name.value;
        const _newGender = +form.gender.value;
        const _newSynopsis = form.synopsis.value;

        setNewName(_newName.toUpperCase()); // to display it in popup UI
        setNewGender(_newGender);
        setNewSynopsis(_newSynopsis);

        if (_newName.toUpperCase() !== character.name) {
            const doesExist = doesCharacterExist(_newName, projectCtx);

            if (doesExist) {
                return setTakenNameError(true);
            }

            setNameOccurrences(projectCtx.editor ? countOccurrences(projectCtx.editor.getJSON(), character.name) : 0);
            setNewNameWarning(true);
            return;
        }

        // if name is the same, just update the character
        upsertCharacterData(
            {
                name: character.name,
                gender: _newGender,
                synopsis: _newSynopsis,
                color: newColor,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    const onNewNameConfirm = () => {
        assert(character, "A character must be defined on edit mode");

        // Replace occurrences in the editor text
        replaceOccurrences(projectCtx.editor!, character.name, newName);

        // Rename the character in the Yjs document (atomic delete + create)
        renameCharacter(character.name, newName, projectCtx);

        // Update the character data with new values
        upsertCharacterData(
            {
                name: newName,
                gender: newGender,
                synopsis: newSynopsis,
                color: newColor,
                persistent: true,
            },
            projectCtx
        );

        closePopup(userCtx);
    };

    type FormDef = {
        title: string;
        onSubmit: (e: FormEvent<HTMLFormElement>) => void;
        name: string | undefined;
        synopsis: string | undefined;
        gender: CharacterGender | string | undefined;
        color: string | undefined;
    };

    const def: FormDef = {
        title: t("create"),
        onSubmit: onCreate,
        name: "",
        synopsis: "",
        gender: "",
        color: undefined,
    };

    if (type === PopupType.EditCharacter) {
        def.title = t("edit");
        def.onSubmit = onEdit;
        def.name = character?.name;
        def.synopsis = character?.synopsis;
        def.gender = character?.gender;
        def.color = character?.color;
    }

    return (
        <div className={popup.window}>
            <div className={popup.container} style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
                <div
                    className={popup.header}
                    onMouseDown={handleMouseDown}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                    <h2 className={popup.title}>{def.title}</h2>
                    <X className={popup.close_btn} onClick={() => closePopup(userCtx)} />
                </div>
                <form className={popup.form} onSubmit={def.onSubmit}>
                    {takenNameError && TakenNameError(newName, t)}
                    {newNameWarning &&
                        NewNameWarning({
                            setNewNameWarning,
                            onNewNameConfirm,
                            nameOccurrences,
                            oldName: character?.name ?? "",
                            newName,
                            t
                        })}
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>{t("name")}</p>
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
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>{t("gender")}</p>
                            <select
                                className={popup.select}
                                name="gender"
                                defaultValue={def.gender}
                                disabled={newNameWarning || takenNameError}
                            >
                                <option value="0">{t("genderFemale")}</option>
                                <option value="1">{t("genderMale")}</option>
                                <option value="2">{t("genderOther")}</option>
                            </select>
                        </div>
                        <hr />
                    </div>
                    <div className={styles.element}>
                        <div className={styles.element_header}>
                            <p>{t("color")}</p>
                            <ColorPicker value={newColor} onChange={setNewColor} />
                        </div>
                        <hr />
                    </div>
                    <div className={styles.element}>
                        <p>{t("synopsis")}</p>
                        <textarea
                            className={join(form.input, popup.textarea)}
                            name="synopsis"
                            defaultValue={def.synopsis}
                            disabled={newNameWarning || takenNameError}
                        />
                    </div>
                    <button
                        disabled={newNameWarning || takenNameError}
                        className={popup.confirm}
                        type="submit"
                    >
                        {t("confirm")}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PopupCharacterItem;
