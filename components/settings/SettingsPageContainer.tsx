import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ERROR_PASSWORD_MATCH } from "@src/lib/messages";
import { useSettings, useUser } from "@src/lib/utils/hooks";
import FormInfo, { FormInfoType } from "../utils/FormInfo";
import Loading from "../utils/Loading";
import { editUserSettings, changePassword } from "@src/lib/utils/requests";

import page from "./SettingsPageContainer.module.css";
import layout from "../utils/Layout.module.css";
import form from "../utils/Form.module.css";
import { join } from "@src/lib/utils/misc";

const SettingsPageContainer = () => {
    const { data: user } = useUser();
    const { data: settings, isLoading } = useSettings();

    useEffect(() => {
        if (!settings || !user) return;

        setCreatedAt(new Date(user.createdAt));
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

    if (isLoading || !user || !settings) {
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

        const newPassword = e.target.pwd1.value;
        const newPasswordRepeat = e.target.pwd2.value;

        if (newPassword != newPasswordRepeat) {
            setFormInfo({ content: ERROR_PASSWORD_MATCH, isError: true });
            return;
        }

        const res = await changePassword(newPassword);
        const json = await res.json();

        setFormInfo({ content: json.message, isError: !res.ok });
    };

    return (
        <div className={layout.center_col}>
            <div className={join(layout.center_content, page.grid)}>
                <div className={page.header}>
                    <h1>Settings</h1>
                    <hr />
                </div>
                <div className={page.profile}>
                    <p className={page.email}>{user.email}</p>
                    <p className={page.joined_date}>
                        joined{" "}
                        {createdAt.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </p>
                </div>
                <div className={page.col_left}>
                    <div className={page.element}>
                        <p>Change password</p>
                        <hr />
                        {formInfo && <FormInfo info={formInfo} />}
                    </div>
                    <form className={page.form} onSubmit={onChangePassword}>
                        <div className={form.element}>
                            <label className={form.element}>
                                <span className={page.label}>New password</span>
                                <input className={form.input} name="pwd1" type="password" autoComplete="on" required />

                                <span className={page.label}>Confirm new password</span>
                                <input className={form.input} name="pwd2" type="password" autoComplete="on" required />
                            </label>
                        </div>

                        <div className={form.btn_flex}>
                            <button className={form.btn} type="submit">
                                Change
                            </button>
                        </div>
                    </form>
                </div>
                <div className={page.col_right}>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Dark theme</p>
                            <input type="checkbox" onClick={toggleTheme} defaultChecked={theme === "dark"} />
                        </div>
                        <hr />
                    </div>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Language</p>
                            <select name="language">
                                <option value="en">English</option>
                                <option value="fr">Français</option>
                            </select>
                        </div>
                        <hr />
                    </div>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Highlight screenplay element on hover</p>
                            <input
                                type="checkbox"
                                onChange={toggleHighlightOnHover}
                                defaultChecked={settings?.highlightOnHover}
                            />
                        </div>
                    </div>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Display scene heading background</p>
                            <input
                                type="checkbox"
                                onChange={toggleSceneBackground}
                                defaultChecked={settings?.sceneBackground}
                            />
                        </div>
                        <hr />
                    </div>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Notes color</p>
                            <input
                                type="color"
                                className={page.notes_color}
                                name="notes-color"
                                value={notesColor}
                                onChange={(e) => setNotesColor(e.target.value)}
                                onBlur={(e) => updateNotesColor(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={page.element}>
                        <div className={page.element_header}>
                            <p>Exported notes color</p>
                            <input
                                type="color"
                                className={page.notes_color}
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
