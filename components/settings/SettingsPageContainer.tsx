import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ERROR_PASSWORD_MATCH } from "../../src/lib/messages";
import { useSettings, useUser } from "../../src/lib/utils/hooks";
import FormInfo, { FormInfoType } from "../home/FormInfo";
import Loading from "../home/Loading";
import { editUserSettings, changePassword } from "../../src/lib/utils/requests";

const SettingsPageContainer = () => {
    const { data: cookieUser } = useUser();
    const { data: settings, isLoading } = useSettings();

    useEffect(() => {
        if (!settings || !cookieUser) return;

        setCreatedAt(new Date(cookieUser.createdAt));
        setSceneBackground(settings.sceneBackground!);
        setHighlightOnHover(settings.highlightOnHover!);
        setNotesColor(settings.notesColor!);
        setExportedNotesColor(settings.exportedNotesColor!);
    }, [settings]);

    const { theme, setTheme } = useTheme();
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const [createdAt, setCreatedAt] = useState<Date>(new Date());

    const [sceneBackground, setSceneBackground] = useState<boolean>(false);
    const [highlightOnHover, setHighlightOnHover] = useState<boolean>(false);
    const [notesColor, setNotesColor] = useState<string>("");
    const [exportedNotesColor, setExportedNotesColor] = useState<string>("");

    if (isLoading || !cookieUser?.isLoggedIn || !settings) {
        return <Loading />;
    }

    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light");
    };

    const resetFromInfo = () => {
        setFormInfo(null);
    };

    const toggleHighlightOnHover = () => {
        editUserSettings({ highlightOnHover: !highlightOnHover });
        setHighlightOnHover(!highlightOnHover);
    };

    const toggleSceneBackground = () => {
        editUserSettings({ sceneBackground: !sceneBackground });
        setSceneBackground(!sceneBackground);
    };

    const updateNotesColor = (newColor: string) => {
        setNotesColor(newColor);
        editUserSettings({ notesColor: newColor });
    };

    const updateExportedNotesColor = (newColor: string) => {
        setExportedNotesColor(newColor);
        editUserSettings({ exportedNotesColor: newColor });
    };

    const onChangePassword = async (e: any) => {
        e.preventDefault();
        resetFromInfo();

        const newPassword = e.target.password1.value;
        const newPasswordRepeat = e.target.password2.value;

        if (newPassword != newPasswordRepeat) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await changePassword(newPassword);
        const json = await res.json();

        if (res.ok) {
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
                    <p className="settings-email">{cookieUser.email}</p>
                    <p className="settings-joined-date">
                        joined{" "}
                        {createdAt.toLocaleDateString("en-GB", {
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
                                <span className="settings-label">New password</span>
                                <input
                                    className="form-input"
                                    name="password1"
                                    type="password"
                                    autoComplete="on"
                                    required
                                />

                                <span className="settings-label">Confirm new password</span>
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
                                onClick={toggleTheme}
                                defaultChecked={theme === "dark"}
                            />
                        </div>
                        <hr />
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Language</p>
                            <select className="select-form" name="language">
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
                                defaultChecked={settings?.highlightOnHover}
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Display scene heading background</p>
                            <input
                                type="checkbox"
                                onChange={toggleSceneBackground}
                                defaultChecked={settings?.sceneBackground}
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
                                value={notesColor}
                                onChange={(e) => setNotesColor(e.target.value)}
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
                                value={exportedNotesColor}
                                onChange={(e) => setExportedNotesColor(e.target.value)}
                                onBlur={(e) => updateExportedNotesColor(e.target.value)}
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
