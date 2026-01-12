"use client";

import { join } from "@src/lib/utils/misc";
import { useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { SceneItem } from "@src/lib/screenplay/screenplay";
import { Clapperboard } from "lucide-react";
import SidebarSceneItem from "./SidebarSceneItem";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

const EditorSidebarNavigation = () => {
    const { scenesData } = useContext(ProjectContext);
    const { isZenMode } = useContext(UserContext);
    const isActive = isZenMode ? "" : sidebar_nav.active;

    return (
        <div className={join(sidebar_nav.container, isActive)}>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <Clapperboard size={18} />
                    <p className={form.label}>Scenes</p>
                </div>
                <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                    {scenesData.length != 0 &&
                        scenesData.map((scene: SceneItem) => {
                            return <SidebarSceneItem key={scene.position} scene={scene} />;
                        })}
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
