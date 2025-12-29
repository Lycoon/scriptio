import { _MS_PER_DAY, getElapsedDaysFrom, getLastUpdate, join } from "@src/lib/utils/misc";

import item from "./ProjectItem.module.css";
import { redirectScreenplay } from "@src/lib/utils/redirects";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Calendar } from "lucide-react";

type Props = {
    project: ProjectMembershipPayload["project"];
};

const ProjectItem = ({ project }: Props) => {
    const elapsedDays = getElapsedDaysFrom(project.updatedAt);
    const lastUpdated = getLastUpdate(elapsedDays);

    let posterPath;
    if (project.poster) posterPath = project.poster;
    else posterPath = "/images/default-poster.png";

    return (
        <button className={join(item.container)} onClick={() => redirectScreenplay(project.id)}>
            <div className={item.title_flex}>
                <div>
                    <h2 className={item.title}>{project.title}</h2>
                    <div className={item.date}>
                        <Calendar size={18} />
                        <p className={item.date_text}>{lastUpdated}</p>
                    </div>
                </div>
                <img className={item.poster} src={posterPath} alt="Movie poster" />
            </div>
        </button>
    );
};

export default ProjectItem;
