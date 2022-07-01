const SettingsPageContainer = () => {
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
                    <form className="settings-form">
                        <div className="form-element">
                            <label id="email-form" className="form-element">
                                <span className="form-label">Password</span>
                                <input
                                    className="form-input"
                                    name="password1"
                                    type="password"
                                    required
                                />
                            </label>

                            <label id="password-form" className="form-element">
                                <span className="form-label">
                                    Confirm password
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
                    <label id="email-form" className="form-element">
                        <span className="form-label">Theme</span>
                        <input
                            className="form-input"
                            name="theme"
                            type="checkbox"
                            required
                        />
                    </label>
                </div>
            </div>
        </div>
    );
};

export default SettingsPageContainer;
