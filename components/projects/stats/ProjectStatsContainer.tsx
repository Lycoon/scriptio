import { Project } from "../../../pages/api/users";
import CharacterFrequency from "./CharacterFrequency";

type Props = {
    project: Project;
};

const ProjectStatsContainer = ({ project }: Props) => {
    return (
        <div id="project-stats-container">
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
        </div>
    );
};

export default ProjectStatsContainer;
