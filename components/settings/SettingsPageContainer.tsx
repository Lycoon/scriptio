import { useTheme } from "next-themes";
import { useState } from "react";
import { User } from "../../pages/api/users";
import { ERROR_PASSWORD_MATCH } from "../../src/lib/messages";
import {
    changePassword,
    editProject,
    editUserSettings,
} from "../../src/lib/requests";
import FormInfo, { FormInfoType } from "../home/FormInfo";

type Props = {
    user: User;
};

const SettingsPageContainer = ({ user }: Props) => {
    user.createdAt = new Date(user.createdAt);

    const { theme, setTheme } = useTheme();
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [notesColor, setNotesColor] = useState<string>(
        user.settings.notesColor
    );
    const [exportedNotesColor, setExportedNotesColor] = useState<string>(
        user.settings.exportedNotesColor
    );
    const [sceneBackground, setSceneBackground] = useState<boolean>(
        user.settings.sceneBackground
    );
    const [highlightOnHover, setHighlightOnHover] = useState<boolean>(
        user.settings.highlightOnHover
    );

    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light");
    };
    const resetFromInfo = () => {
        setFormInfo(null);
    };

    const toggleHighlightOnHover = () => {
        editUserSettings(user.id, { highlightOnHover: !highlightOnHover });
        setHighlightOnHover(!highlightOnHover);
    };

    const toggleSceneBackground = () => {
        editUserSettings(user.id, { sceneBackground: !sceneBackground });
        setSceneBackground(!sceneBackground);
    };

    const updateNotesColor = (newColor: string) => {
        setNotesColor(newColor);
        editUserSettings(user.id, { notesColor: newColor });
    };

    const updateExportedNotesColor = (newColor: string) => {
        setExportedNotesColor(newColor);
        editUserSettings(user.id, { exportedNotesColor: newColor });
    };

    const onChangePassword = async (e: any) => {
        e.preventDefault();
        resetFromInfo();

        const pwd1 = e.target.password1.value;
        const pwd2 = e.target.password2.value;

        if (pwd1 != pwd2) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await changePassword(user.id, pwd1);
        const json = await res.json();

        if (res.status === 200) {
            setFormInfo({ content: json.message });
        } else {
            setFormInfo({ content: json.message, isError: true });
        }
    };

    return (
        <div className="center-flex">
            <div id="settings-container">
                <div className="settings-header">
                    <h1>Settings</h1>
                    <hr />
                </div>
                <div className="settings-profile">
                    <p className="settings-email">{user.email}</p>
                    <p className="settings-joined-date">
                        joined{" "}
                        {user.createdAt.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </p>
                </div>
                <div className="settings-column-left">
                    <div className="settings-element">
                        <p>Change password</p>
                        <hr />
                        {formInfo && <FormInfo info={formInfo} />}
                    </div>
                    <form className="settings-form" onSubmit={onChangePassword}>
                        <div className="form-element">
                            <label id="password-form" className="form-element">
                                <span className="form-label settings-label">
                                    New password
                                </span>
                                <input
                                    className="form-input"
                                    name="password1"
                                    type="password"
                                    autoComplete="on"
                                    required
                                />

                                <span className="form-label settings-label">
                                    Confirm new password
                                </span>
                                <input
                                    className="form-input"
                                    name="password2"
                                    type="password"
                                    autoComplete="on"
                                    required
                                />
                            </label>
                        </div>

                        <div id="form-btn-flex">
                            <button className="form-btn" type="submit">
                                Confirm
                            </button>
                        </div>
                    </form>
                </div>
                <div className="settings-column-right">
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Dark theme</p>
                            <input
                                type="checkbox"
                                onChange={toggleTheme}
                                defaultChecked={theme === "dark"}
                            />
                        </div>
                        <hr />
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Language</p>
                            <select id="language-form" name="language">
                                <option value="en">English</option>
                                <option value="fr">Français</option>
                            </select>
                        </div>
                        <hr />
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Highlight screenplay element on hover</p>
                            <input
                                type="checkbox"
                                onChange={toggleHighlightOnHover}
                                defaultChecked={user.settings.highlightOnHover}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Display scene heading background</p>
                            <input
                                type="checkbox"
                                onChange={toggleSceneBackground}
                                defaultChecked={user.settings.sceneBackground}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Notes color</p>
                            <input
                                type="color"
                                className="notes-color"
                                name="notes-color"
                                defaultValue={user.settings.notesColor}
                                onBlur={(e) => updateNotesColor(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Exported notes color</p>
                            <input
                                type="color"
                                className="notes-color"
                                name="exported-notes-color"
                                defaultValue={user.settings.exportedNotesColor}
                                onBlur={(e) =>
                                    updateExportedNotesColor(e.target.value)
                                }
                            />
                        </div>
                        <hr />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPageContainer;
