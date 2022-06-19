import Router from "next/router";
import { Project } from "../../../pages/api/users";
import CharacterFrequency from "./CharacterFrequency";

type Props = {
    project: Project;
};

const ProjectStatsContainer = ({ project }: Props) => {
    const onBackButton = () => {
        Router.push(`/projects/${project.id}/editor`);
    };

    return (
        <div id="project-stats-container">
            {project.screenplay ? (
                <div className="center-column">
                    <div>
                        <h1 id="project-page-title">Statistics</h1>
                        <p className="stats-title-text">{project.title}</p>
                    </div>
                    <div>
                        <h3>Characters frequency</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterFrequency project={project} />
                            </div>
                            <div>
                                <CharacterFrequency project={project} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <h3>Characters frequency</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterFrequency project={project} />
                            </div>
                            <div>
                                <CharacterFrequency project={project} />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="no-stats-container">
                    <div className="no-stats-div">
                        <p className="no-stats-title">
                            Your screenplay is empty
                        </p>
                        <p className="no-stats-subtitle">
                            Write an outstanding story and come back to see your
                            statistics
                        </p>
                        <button
                            className="form-btn no-stats-back-btn"
                            onClick={onBackButton}
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectStatsContainer;
