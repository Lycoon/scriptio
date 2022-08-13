import Router from "next/router";
import { Project } from "../../../pages/api/users";
import CharacterFrequency from "./CharacterFrequency";

type Props = {
    project: Project;
};

const onBackButton = (projectId: number) => {
    Router.push(`/projects/${projectId}/screenplay`);
};

const NoStatsContainer = ({ projectId }: any) => (
    <div className="no-stats-container">
        <div className="no-stats-div">
            <p className="no-stats-title">Your screenplay is empty</p>
            <p className="no-stats-subtitle">
                Write an outstanding story and come back to see your statistics
            </p>
            <button
                className="form-btn no-stats-back-btn"
                onClick={() => onBackButton(projectId)}
            >
                Back
            </button>
        </div>
    </div>
);

const ProjectStatsContainer = ({ project }: Props) => {
    return (
        <div id="project-stats-container">
            {project.screenplay ? (
                <div className="center-column">
                    <div className="project-stats-header">
                        <h1>Statistics</h1>
                        <p className="stats-title-text">{project.title}</p>
                        <hr />
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
                <NoStatsContainer projectId={project.id} />
            )}
        </div>
    );
};

export default ProjectStatsContainer;
