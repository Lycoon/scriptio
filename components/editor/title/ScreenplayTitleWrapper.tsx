import ScreenplayTitle from "./ScreenplayTitle";
import { Project } from "@src/lib/utils/types";

import styles from "../ScreenplayWrapper.module.css";

type ScreenplayTitleWrapperProps = {
    project: Project;
};

const ScreenplayTitleWrapper = ({ project }: ScreenplayTitleWrapperProps) => {
    return (
        <div id={styles.container}>
            <ScreenplayTitle project={project} />
        </div>
    );
};

export default ScreenplayTitleWrapper;
