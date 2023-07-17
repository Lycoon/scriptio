import BackButton from "@components/utils/BackButton";
import { redirectScreenplay } from "@src/lib/utils/redirects";

import stats from "./ProjectStatsContainer.module.css";
import noStats from "./NoStatsContainer.module.css";

type Props = {
    projectId: string;
};

const NoStatsContainer = ({ projectId }: Props) => {
    return (
        <div className={stats.container}>
            <div className={noStats.container}>
                <div className={noStats.content}>
                    <p className={noStats.title}>Your screenplay is not long enough</p>
                    <p className={noStats.subtitle}>Write some more and come back to see your statistics</p>
                    <div className={noStats.back_btn}>
                        <BackButton onClick={() => redirectScreenplay(projectId)} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NoStatsContainer;
