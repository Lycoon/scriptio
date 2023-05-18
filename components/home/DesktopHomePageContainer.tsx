import Router from "next/router";
import { useState } from "react";
import NewProjectPage from "../projects/NewProjectPage";

const DesktopHomePageContainer = () => {
    const [isCreating, setIsCreating] = useState(false);

    if (isCreating) return <NewProjectPage setIsCreating={setIsCreating} />;
    else
        return (
            <div className="center-flex">
                <div id="desktop-projects-container">
                    <div className="projects-header">
                        <div className="projects-header-info">
                            <h1>Projects</h1>
                            <div className="projects-header-buttons">
                                <button
                                    className="form-btn create-project-button"
                                    onClick={() => setIsCreating(true)}
                                >
                                    Create
                                </button>
                                <button className="form-btn create-project-button">Open...</button>
                            </div>
                        </div>
                        <hr />
                    </div>
                </div>
            </div>
        );
};

export default DesktopHomePageContainer;
