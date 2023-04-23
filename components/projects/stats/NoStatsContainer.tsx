import Link from "next/link";

type Props = {
    projectId: string;
};

const NoStatsContainer = ({ projectId }: Props) => {
    return (
        <div id="project-stats-container">
            <div className="no-stats-container">
                <div className="no-stats-div">
                    <p className="no-stats-title">Your screenplay is not long enough</p>
                    <p className="no-stats-subtitle">
                        Write some more and come back to see your statistics
                    </p>
                    <Link legacyBehavior href={`/projects/${projectId}/screenplay`}>
                        <a className="form-btn no-stats-back-btn">Back</a>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default NoStatsContainer;
