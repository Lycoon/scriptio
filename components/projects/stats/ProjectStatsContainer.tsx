import Router from "next/router";
import { useEffect, useState } from "react";
import { Project } from "../../../pages/api/users";
import { getScreenplayData } from "../../../src/lib/statistics";
import CharacterDistribution from "./CharacterDistribution";
import CharacterFrequency from "./CharacterFrequency";
import CharacterQuantity from "./CharacterQuantity";
import CharacterThreshold from "./CharacterQuantity";
import BarRatio from "./BarRatio";

type Props = {
    project: Project;
};

const ProjectStatsContainer = ({ project }: Props) => {
    const data = getScreenplayData(project.screenplay);
    const pages = data.pageLimits.length + 1;
    const screenTime = pages * 1.15;

    const [color, setColor] = useState<string>("#ffffff");

    useEffect(() => {
        setColor(
            getComputedStyle(document.body).getPropertyValue("--primary-bg")
        );
    }, [color]);

    return (
        <div id="project-stats-container">
            <div className="center-column">
                <div className="project-stats-header">
                    <h1>Statistics</h1>
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
                        <p className="general-stats-element-data">{pages}</p>
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
                    <h2 className="general-stats-part-title">Characters</h2>
                    <div className="charts-col">
                        <div className="character-distribution">
                            <p>Dialogue length distribution over time</p>
                            <CharacterDistribution
                                color={color}
                                project={project}
                                distribution={data.distribution}
                                frequency={data.frequency}
                            />
                        </div>
                        <div className="charts-row">
                            <div>
                                <p>Distribution of dialogue (per character)</p>
                                <CharacterFrequency
                                    color={color}
                                    project={project}
                                    frequency={data.frequency}
                                />
                            </div>
                            <div>
                                <p>Average dialogue length (per character)</p>
                                <CharacterQuantity
                                    color={color}
                                    project={project}
                                    quantity={data.quantity}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div>
                    <h2 className="general-stats-part-title">Screenplay</h2>
                    <div className="charts-row">
                        <div>
                            <p>Proportion of interior and exterior scenes</p>
                            <BarRatio
                                color={color}
                                project={project}
                                ratio={data.sceneRatio}
                            />
                        </div>
                        <div>
                            <p>Proportion of action and dialogue</p>
                            <BarRatio
                                color={color}
                                project={project}
                                ratio={data.actionRatio}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectStatsContainer;
