import { useTheme } from "next-themes";

const ChangePasswordForm = () => (
    <form className="settings-form">
        <div className="form-element">
            <label id="email-form" className="form-element">
                <span className="form-label">New password</span>
                <input
                    className="form-input"
                    name="password1"
                    type="password"
                    required
                />
            </label>

            <label id="password-form" className="form-element">
                <span className="form-label">Confirm new password</span>
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
);

const SettingsPageContainer = () => {
    const { theme, setTheme } = useTheme();
    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light");
    };

    return (
        <div className="center-flex">
            <div id="settings-container">
                <div className="settings-header">
                    <h1>Settings</h1>
                    <hr />
                </div>
                <div className="settings-profile">
                    <p>hugo.bois@hotmail.fr</p>
                    <p>joined 28/06/2021</p>
                </div>
                <div className="settings-column-left">
                    <div className="settings-element">
                        <p>Change password</p>
                        <hr />
                    </div>
                    <ChangePasswordForm />
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
