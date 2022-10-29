import { useEffect, useState } from "react";
import {
    getScenesData,
    SceneItem,
    ScenesData,
} from "../../../src/lib/screenplayUtils";
import SidebarSceneItem from "./SidebarSceneItem";

type Props = {
    active: boolean;
    getFocusOnPosition: (position: number) => void;
};

const EditorSidebarNavigation = ({ active, getFocusOnPosition }: Props) => {
    const isActive = active ? "navigation-on" : "";
    const [scenes, setScenes] = useState<ScenesData>(getScenesData());
    const characters: any[] = [];

    useEffect(() => {
        setScenes(getScenesData());
    }, [getScenesData()]);

    return (
        <div className={`navigation-sidebar ${isActive}`}>
            <div>
                <div className="sidebar-selection">
                    <p className="scene-list-title selected">Characters</p>
                    <p className="scene-list-title">Locations</p>
                    <p className="scene-list-title">Others</p>
                </div>
                <div className="scene-list">
                    {characters.map((character: any) => {
                        return (
                            <SidebarSceneItem
                                title={character.name}
                                position={0}
                                focusOn={getFocusOnPosition}
                            />
                        );
                    })}
                </div>
            </div>
            <div>
                <p className="scene-list-title">Scenes</p>
                <div className="scene-list">
                    {scenes.map((scene: SceneItem) => {
                        return (
                            <SidebarSceneItem
                                key={scene.position}
                                title={scene.title}
                                position={scene.position}
                                focusOn={getFocusOnPosition}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
