import { useEffect, useState } from "react";
import { getScreenplayData } from "@src/lib/editor/statistics";
import CharacterDistribution from "./CharacterDistribution";
import CharacterFrequency from "./CharacterFrequency";
import CharacterQuantity from "./CharacterQuantity";
import BarRatio from "./BarRatio";
import { Project } from "@src/lib/utils/types";

import stats from "./ProjectStatsContainer.module.css";
import layout from "../../utils/Layout.module.css";

type Props = {
    project: Project;
};

const ProjectStatsContainer = ({ project }: Props) => {
    const data = getScreenplayData(project.screenplay);
    const pages = data.pageLimits.length + 1;
    const screenTime = pages * 1.15;

    const [color, setColor] = useState<string>("#ffffff");

    useEffect(() => {
        setColor(getComputedStyle(document.body).getPropertyValue("--primary"));
    }, [color]);

    return (
        <div className={stats.container}>
            <div className={stats.center_content}>
                <div className={stats.title_header}>
                    <h1>Statistics</h1>
                    <hr />
                </div>
                <div className={stats.header}>
                    <div className={stats.element}>
                        <p className={stats.element_data}>{data.words.toLocaleString()}</p>
                        <p className={stats.element_info}>words</p>
                    </div>
                    <div className={stats.element}>
                        <p className={stats.element_data}>{data.actors}</p>
                        <p className={stats.element_info}>actors</p>
                    </div>
                    <div className={stats.element}>
                        <p className={stats.element_data}>{pages}</p>
                        <p className={stats.element_info}>pages</p>
                    </div>
                    <div className={stats.element}>
                        <p className={stats.element_data}>~{screenTime.toFixed()}</p>
                        <p className={stats.element_info}>screen time (min.)</p>
                    </div>
                </div>
                <div>
                    <h2 className={stats.part_title}>Characters</h2>
                    <div className={stats.charts_col}>
                        <div className={stats.character_distribution}>
                            <p>Dialogue length distribution over time</p>
                            <CharacterDistribution
                                color={color}
                                project={project}
                                distribution={data.distribution}
                                frequency={data.frequency}
                            />
                        </div>
                        <div className={stats.charts_row}>
                            <div>
                                <p>Distribution of dialogue (per character)</p>
                                <CharacterFrequency color={color} project={project} frequency={data.frequency} />
                            </div>
                            <div>
                                <p>Average dialogue length (per character)</p>
                                <CharacterQuantity color={color} project={project} quantity={data.quantity} />
                            </div>
                        </div>
                    </div>
                </div>
                <div>
                    <h2 className={stats.part_title}>Screenplay</h2>
                    <div className={stats.charts_row}>
                        <div>
                            <p>Proportion of interior and exterior scenes</p>
                            <BarRatio color={color} project={project} ratio={data.sceneRatio} />
                        </div>
                        <div>
                            <p>Proportion of action and dialogue</p>
                            <BarRatio color={color} project={project} ratio={data.actionRatio} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectStatsContainer;
