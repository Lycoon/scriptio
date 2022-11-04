import { useState } from "react";
import { Project } from "../../pages/api/users";

type Props = {};

const Popup = ({}: Props) => {
    const [active, updateActive] = useState<boolean>(false);
    const title = "Create character";
    const toggleDropdown = () => {
        updateActive(!active);
    };

    const onSubmit = () => {};

    return (
        <div className="popup active">
            <div className="popup-header">
                <h2 className="popup-title">{title}</h2>
                <button className="popup-close" onClick={toggleDropdown}>
                    X
                </button>
            </div>
            <form className="popup-form">
                <div className="settings-element">
                    <div className="settings-element-header">
                        <p>Name</p>
                        <input className="form-input popup-input" required />
                    </div>
                    <hr />
                </div>
                <div className="settings-element">
                    <div className="settings-element-header">
                        <p>Gender</p>
                        <select className="select-form popup-select" name="language">
                            <option value="en">Female</option>
                            <option value="fr">Male</option>
                            <option value="fr">Other</option>
                        </select>
                    </div>
                    <hr />
                </div>
                <div className="settings-element">
                    <p>Synopsis</p>
                    <textarea className="form-input popup-textarea" name="synopsis" />
                </div>
                <button className="form-btn popup-confirm" onClick={onSubmit} type="submit">
                    Confirm
                </button>
            </form>
        </div>
    );
};

export default Popup;
