import Link from "next/link";
import Router from "next/router";
import { Project } from "../../../pages/api/users";

type Props = {
    projectId: number;
};

const NoStatsContainer = ({ projectId }: Props) => {
    const onBackButton = () => {
        Router.push(`/projects/${projectId}/screenplay`);
    };

    return (
        <div id="project-stats-container">
            <div className="no-stats-container">
                <div className="no-stats-div">
                    <p className="no-stats-title">Your screenplay is empty</p>
                    <p className="no-stats-subtitle">
                        Write some more and come back to see your statistics
                    </p>
                    <Link href={`/projects/${projectId}/screenplay`}>
                        <a className="form-btn no-stats-back-btn">Back</a>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default NoStatsContainer;
