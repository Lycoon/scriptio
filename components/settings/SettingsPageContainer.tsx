import { useTheme } from "next-themes";
import { useState } from "react";
import { User } from "../../pages/api/users";
import { ERROR_PASSWORD_MATCH } from "../../src/lib/messages";
import { changePassword } from "../../src/lib/requests";
import FormInfo, { FormInfoType } from "../home/FormInfo";

type Props = {
    user: User;
};

const SettingsPageContainer = ({ user }: Props) => {
    const { theme, setTheme } = useTheme();
    const [formInfo, setFormInfo] = useState<FormInfoType | null>(null);
    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light");
    };
    const resetFromInfo = () => {
        setFormInfo(null);
    };

    async function onSubmit(e: any) {
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
    }

    return (
        <div className="center-flex">
            <div id="settings-container">
                <div className="settings-header">
                    <h1>Settings</h1>
                    <hr />
                </div>
                <div className="settings-profile">
                    <p>{user.email}</p>
                    <p>joined 28/06/2021</p>
                </div>
                <div className="settings-column-left">
                    <div className="settings-element">
                        <p>Change password</p>
                        <hr />
                        {formInfo && <FormInfo info={formInfo} />}
                    </div>
                    <form className="settings-form" onSubmit={onSubmit}>
                        <div className="form-element">
                            <label id="password-form" className="form-element">
                                <span className="form-label">New password</span>
                                <input
                                    className="form-input"
                                    name="password1"
                                    type="password"
                                    required
                                />

                                <span className="form-label">
                                    Confirm new password
                                </span>
                                <input
                                    className="form-input"
                                    name="password2"
                                    type="password"
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
                </div>
            </div>
        </div>
    );
};

export default SettingsPageContainer;
