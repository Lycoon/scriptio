import Router from "next/router";
import { useEffect, useState } from "react";
import { Project } from "../../../pages/api/users";
import { getScreenplayData } from "../../../src/lib/statistics";
import CharacterDistribution from "./CharacterDistribution";
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
    const data = getScreenplayData(project.screenplay);
    const pages = data.pageLimits.length + 1;
    const screenTime = pages / 1.1;

    const [color, setColor] = useState<string>("#ffffff");

    useEffect(() => {
        setColor(
            getComputedStyle(document.body).getPropertyValue("--primary-bg")
        );
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
                            <p className="general-stats-element-data">
                                {data.words.toLocaleString()}
                            </p>
                            <p className="general-stats-element-info">words</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">
                                {data.actors}
                            </p>
                            <p className="general-stats-element-info">actors</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">
                                {pages}
                            </p>
                            <p className="general-stats-element-info">pages</p>
                        </div>
                        <div className="general-stats-element">
                            <p className="general-stats-element-data">
                                ~{screenTime.toFixed()}
                            </p>
                            <p className="general-stats-element-info">
                                screen time (min.)
                            </p>
                        </div>
                    </div>
                    <div>
                        <h3>Characters frequency</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterDistribution
                                    color={color}
                                    project={project}
                                    distribution={data.distribution}
                                    frequency={data.frequency}
                                />
                            </div>
                            <div>
                                <CharacterFrequency
                                    color={color}
                                    project={project}
                                    frequency={data.frequency}
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <h3>Screenplay structure</h3>
                        <div className="charts-row">
                            <div>
                                <CharacterFrequency
                                    color={color}
                                    project={project}
                                    frequency={data.frequency}
                                />
                            </div>
                            <div>
                                <CharacterFrequency
                                    color={color}
                                    project={project}
                                    frequency={data.frequency}
                                />
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
