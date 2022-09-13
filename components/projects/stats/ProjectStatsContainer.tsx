import Router from "next/router";
import { useEffect, useState } from "react";
import { Project } from "../../../pages/api/users";
import { getNumberOfActors, getNumberOfWords } from "../../../src/lib/statistics";
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
    const words = getNumberOfWords(project.screenplay);
    const actors = getNumberOfActors(project.screenplay);
    const pages = words / 190;
    const screenTime = pages / 1.1;

    const [color, setColor] = useState<string>("#ffffff");

    useEffect(() => {
         setColor(getComputedStyle(document.body).getPropertyValue("--primary-bg"));
    }, [color]);

    return (
        <div id="project-stats-container">
            {project.screenplay ? (
                <div className="center-column">
                    <div className="project-stats-header">
                        <h1>Statistics</h1>
                        <p className="stats-title-text">{project.title}</p>
                        <hr />
                    </div>
                    <div className="general-stats-header">
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">{words}</p>
                            <p className="general-stats-element-info">words</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">{actors}</p>
                            <p className="general-stats-element-info">actors</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">~{pages.toFixed()}</p>
                            <p className="general-stats-element-info">pages</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">~{screenTime.toFixed(1)}</p>
                            <p className="general-stats-element-info">screen time (min.)</p>
                        </div>
                    </div>
                    <div>
                        <h3>Characters frequency</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterFrequency color={color} project={project} />
                            </div>
                            <div>
                                <CharacterFrequency color={color} project={project} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <h3>Screenplay structure</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterFrequency color={color} project={project} />
                            </div>
                            <div>
                                <CharacterFrequency color={color} project={project} />
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
